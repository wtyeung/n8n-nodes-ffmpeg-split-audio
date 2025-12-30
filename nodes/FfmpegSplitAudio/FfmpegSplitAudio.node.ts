import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';

const execAsync = promisify(exec);
const FFMPEG_PATH = ffmpegPath.path;

export class FfmpegSplitAudio implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FFmpeg Split Audio',
		name: 'ffmpegSplitAudio',
		icon: { light: 'file:ffmpeg.svg', dark: 'file:ffmpeg.dark.svg' },
		group: ['transform'],
		version: 1,
		description: 'Split audio files using FFmpeg',
		defaults: {
			name: 'FFmpeg Split Audio',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Calculate Segments',
						value: 'calculateSegments',
						description: 'Calculate segment start and end times based on audio duration',
						action: 'Calculate audio segments',
					},
					{
						name: 'Extract Segment',
						value: 'extractSegment',
						description: 'Extract a specific audio segment from start to end time',
						action: 'Extract audio segment',
					},
				],
				default: 'calculateSegments',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary property containing the audio file',
			},
			{
				displayName: 'Segment Length (seconds)',
				name: 'segmentLength',
				type: 'number',
				default: 30,
				required: true,
				displayOptions: {
					show: {
						operation: ['calculateSegments'],
					},
				},
				description: 'Target length of each segment in seconds',
			},
			{
				displayName: 'Overlap (seconds)',
				name: 'overlap',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						operation: ['calculateSegments'],
					},
				},
				description: 'Overlap between segments in seconds',
			},
			{
				displayName: 'Output Segments',
				name: 'outputSegments',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['calculateSegments'],
					},
				},
				description: 'Whether to output all segments as binary data. Each segment will be in a separate binary property (data_1, data_2, etc.)',
			},
			{
				displayName: 'Start Time (seconds)',
				name: 'startTime',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						operation: ['extractSegment'],
					},
				},
				description: 'Start time of the segment to extract in seconds',
			},
			{
				displayName: 'End Time (seconds)',
				name: 'endTime',
				type: 'number',
				default: 30,
				required: true,
				displayOptions: {
					show: {
						operation: ['extractSegment'],
					},
				},
				description: 'End time of the segment to extract in seconds',
			},
			{
				displayName: 'Custom Filename',
				name: 'customFilename',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['extractSegment'],
					},
				},
				placeholder: 'Leave empty for auto-generated name',
				description: 'Custom filename for the extracted audio. Leave empty to use pattern: {original}_{start}_{end}.{ext}',
			},
			{
				displayName: 'Output Binary Property',
				name: 'outputBinaryPropertyName',
				type: 'string',
				default: 'data',
				displayOptions: {
					show: {
						operation: ['extractSegment'],
					},
				},
				description: 'Name of the binary property for the extracted audio',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
				const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
				const binaryDataBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

				if (operation === 'calculateSegments') {
					const segmentLength = this.getNodeParameter('segmentLength', itemIndex) as number;
					const overlap = this.getNodeParameter('overlap', itemIndex) as number;
					const outputSegments = this.getNodeParameter('outputSegments', itemIndex, false) as boolean;

					const fileExtension = binaryData.fileExtension || 'm4a';
					const tempInputPath = join(tmpdir(), `input_${Date.now()}_${itemIndex}.${fileExtension}`);
					await writeFile(tempInputPath, binaryDataBuffer);

					try {
						const { stdout } = await execAsync(
							`"${FFMPEG_PATH}" -i "${tempInputPath}" -f null - 2>&1 | grep "Duration"`,
						);

						const durationMatch = stdout.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
						if (!durationMatch) {
							throw new Error('Could not extract duration from audio file');
						}

						const hours = parseInt(durationMatch[1], 10);
						const minutes = parseInt(durationMatch[2], 10);
						const seconds = parseFloat(durationMatch[3]);
						const totalDuration = hours * 3600 + minutes * 60 + seconds;

						const segments: Array<{ start: number; end: number; index: number }> = [];
						const step = segmentLength - overlap;
						let currentStart = 0;
						let segmentIndex = 0;

						while (currentStart < totalDuration) {
							const currentEnd = Math.min(currentStart + segmentLength, totalDuration);
							segments.push({
								index: segmentIndex,
								start: parseFloat(currentStart.toFixed(2)),
								end: parseFloat(currentEnd.toFixed(2)),
							});
							currentStart += step;
							segmentIndex++;
						}

						if (outputSegments) {
							const binaryOutput: { [key: string]: any } = {};
							const originalName = binaryData.fileName || 'audio';
							const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
							const tempOutputPaths: string[] = [];

							try {
								for (const segment of segments) {
									const duration = segment.end - segment.start;
									const tempOutputPath = join(
										tmpdir(),
										`output_${Date.now()}_${itemIndex}_${segment.index}.${fileExtension}`,
									);
									tempOutputPaths.push(tempOutputPath);

									await execAsync(
										`"${FFMPEG_PATH}" -i "${tempInputPath}" -ss ${segment.start} -t ${duration} -c copy "${tempOutputPath}"`,
									);

									const extractedBuffer = await readFile(tempOutputPath);
									const outputFilename = `${nameWithoutExt}_${segment.start}_${segment.end}.${fileExtension}`;
									const segmentBinaryData = await this.helpers.prepareBinaryData(
										extractedBuffer,
										outputFilename,
										binaryData.mimeType,
									);

									binaryOutput[`${binaryPropertyName}_${segment.index + 1}`] = segmentBinaryData;
								}

								returnData.push({
									json: {
										totalDuration,
										segmentLength,
										overlap,
										segmentCount: segments.length,
										segments,
									},
									binary: binaryOutput,
									pairedItem: itemIndex,
								});
							} finally {
								for (const tempPath of tempOutputPaths) {
									await unlink(tempPath).catch(() => {});
								}
							}
						} else {
							returnData.push({
								json: {
									totalDuration,
									segmentLength,
									overlap,
									segmentCount: segments.length,
									segments,
								},
								pairedItem: itemIndex,
							});
						}
					} finally {
						await unlink(tempInputPath).catch(() => {});
					}
				} else if (operation === 'extractSegment') {
					const startTime = this.getNodeParameter('startTime', itemIndex) as number;
					const endTime = this.getNodeParameter('endTime', itemIndex) as number;
					const customFilename = this.getNodeParameter('customFilename', itemIndex, '') as string;
					const outputBinaryPropertyName = this.getNodeParameter(
						'outputBinaryPropertyName',
						itemIndex,
					) as string;

					if (endTime <= startTime) {
						throw new Error('End time must be greater than start time');
					}

					const duration = endTime - startTime;
					const fileExtension = binaryData.fileExtension || 'm4a';
					const tempInputPath = join(tmpdir(), `input_${Date.now()}_${itemIndex}.${fileExtension}`);
					const tempOutputPath = join(tmpdir(), `output_${Date.now()}_${itemIndex}.${fileExtension}`);

					await writeFile(tempInputPath, binaryDataBuffer);

					try {
						await execAsync(
							`"${FFMPEG_PATH}" -i "${tempInputPath}" -ss ${startTime} -t ${duration} -c copy "${tempOutputPath}"`,
						);

						const extractedBuffer = await readFile(tempOutputPath);
						
						let outputFilename: string;
						if (customFilename) {
							outputFilename = customFilename;
						} else {
							const originalName = binaryData.fileName || 'audio';
							const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
							outputFilename = `${nameWithoutExt}_${startTime}_${endTime}.${fileExtension}`;
						}
						
						const newBinaryData = await this.helpers.prepareBinaryData(
							extractedBuffer,
							outputFilename,
							binaryData.mimeType,
						);

						returnData.push({
							json: {
								startTime,
								endTime,
								duration,
							},
							binary: {
								[outputBinaryPropertyName]: newBinaryData,
							},
							pairedItem: itemIndex,
						});
					} finally {
						await unlink(tempInputPath).catch(() => {});
						await unlink(tempOutputPath).catch(() => {});
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: itemIndex,
					});
				} else {
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}
}
