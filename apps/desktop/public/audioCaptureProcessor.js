/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class VaakCaptureAnalysisProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    const channel = input?.[0];

    if (channel && channel.length > 0) {
      this.port.postMessage({
        type: "samples",
        sampleRate,
        samples: Array.from(channel),
      });
    }

    return true;
  }
}

registerProcessor("vaak-capture-analysis", VaakCaptureAnalysisProcessor);
