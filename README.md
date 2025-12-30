# n8n-nodes-ffmpeg-split-audio

This is an n8n community node. It lets you split audio files using FFmpeg in your n8n workflows.

FFmpeg is a powerful multimedia framework that can decode, encode, transcode, mux, demux, stream, filter and play audio and video files. This node provides audio splitting capabilities for workflow automation.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Prerequisites](#prerequisites)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

This node supports two operations:

### Calculate Segments
Analyzes an audio file and calculates segment start/end times based on:
- **Segment Length**: Target duration for each segment (in seconds)
- **Overlap**: Overlap duration between consecutive segments (in seconds)
- **Output Segments**: Optional - when enabled, automatically splits the audio and outputs all segments as binary data

Returns an array of segments with their start and end times. When "Output Segments" is enabled, also outputs each segment as separate binary properties (`data_1`, `data_2`, etc.) with filenames following the pattern `{original}_{start}_{end}.{ext}`.

### Extract Segment
Extracts a specific portion of an audio file:
- **Start Time**: Beginning of the segment to extract (in seconds)
- **End Time**: End of the segment to extract (in seconds)
- **Custom Filename**: Optional - specify a custom filename for the extracted audio

Outputs the extracted audio as binary data. If no custom filename is provided, uses the pattern `{original}_{start}_{end}.{ext}`.

## Prerequisites

**No external dependencies required!** This node includes FFmpeg binaries via `@ffmpeg-installer/ffmpeg`, so FFmpeg is automatically bundled with the package for all supported platforms (Windows, macOS, Linux).

## Compatibility

Minimum n8n version: 1.0.0

Tested with:
- n8n v1.x
- FFmpeg 4.x and 5.x

## Usage

### Example Workflow: Calculate Segments

1. Add a node that provides binary audio data (e.g., Read Binary File)
2. Add the FFmpeg Split Audio node
3. Select "Calculate Segments" operation
4. Set segment length (e.g., 30 seconds)
5. Set overlap (e.g., 5 seconds for context between segments)
6. Enable "Output Segments" if you want to automatically split and output all segments
7. The output will contain:
   - JSON with segment timing information
   - Binary data for each segment (if "Output Segments" is enabled)

### Example Workflow: Extract Segment

1. Add a node that provides binary audio data
2. Add the FFmpeg Split Audio node
3. Select "Extract Segment" operation
4. Set start time (e.g., 10.5 seconds)
5. Set end time (e.g., 40.5 seconds)
6. The extracted audio segment will be available as binary data

### Tips

- Use "Calculate Segments" with "Output Segments" enabled to automatically split an entire audio file into multiple segments
- Use "Extract Segment" when you need to extract a specific portion of audio
- Overlap is useful when processing speech or music to avoid cutting off content
- The node preserves the original audio codec when extracting segments (using `-c copy`) for fast processing
- Binary properties are named sequentially: `data_1`, `data_2`, `data_3`, etc.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [FFmpeg documentation](https://ffmpeg.org/documentation.html)
* [FFmpeg wiki](https://trac.ffmpeg.org/wiki)

## Version history

### 0.1.0
- Initial release
- Calculate Segments operation
- Extract Segment operation
