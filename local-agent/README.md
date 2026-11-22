# FREMIQ Local Agent for Windows

This optional companion runs on the same Windows computer as the browser using FREMIQ. It enables local Faster-Whisper transcription without OpenAI API credits.

## Install and pair

1. Extract this folder to a location you can keep, such as Documents/FREMIQ Local Agent.
2. Double-click **Start FREMIQ Agent.bat**. The first run creates a private Python environment and installs the agent runtime. It needs Python 3.10+ and internet access.
3. Keep the agent window open. It displays the agent URL and a six-digit pairing code. If the agent restarts, the launcher starts it again automatically.
4. In FREMIQ, open **Local Agent**, enter http://127.0.0.1:8765 and the displayed pairing code, then click **Connect**.
5. In **Tool Manager**, install **Faster-Whisper (Local)**. FREMIQ pins a compatible PyAV version during setup. The package and speech model download are large; CPU INT8 works without an NVIDIA GPU.
6. Retry transcription. FREMIQ will send the media to the paired agent on this computer.

The pairing code expires after ten minutes. Restart the agent to get another code. Keep the agent window open while transcribing. Stop it by closing that window.

The agent binds only to 127.0.0.1; it is not exposed to the network. It accepts transcription requests only after pairing. Video/audio is processed locally by Faster-Whisper after installation. FREMIQ must also run on this computer: a remote hosted server cannot reach this computer's 127.0.0.1 address.

The agent currently handles local speech transcription, allow-listed transcription package installs, pairing, health checks, and diagnostics. FREMIQ's main app handles video editing, FFmpeg renders, and extension management.

## Requirements

- Windows 10 or newer
- Python 3.10 or newer available as py -3 or python
- Internet for first-time runtime, package, and speech-model downloads
- FFmpeg available on the FREMIQ host if FREMIQ needs to extract audio before sending it to this agent
