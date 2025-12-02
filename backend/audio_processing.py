import numpy as np
import io
import httpx
import os
from dotenv import load_dotenv
import librosa
import tempfile
from fastapi import File, UploadFile

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def estimate_speaker_direction(audio_data, sample_rate):
    """
    Estimate speaker direction using phase difference analysis.
    This is a simplified version - in production, you'd use multiple microphones.
    For now, we use spectral analysis to estimate direction.
    """
    # Convert to mono if stereo
    if len(audio_data.shape) > 1:
        audio_data = np.mean(audio_data, axis=1)
    
    # Use frequency domain analysis to estimate direction
    # Higher frequencies tend to come from different directions
    fft = np.fft.fft(audio_data)
    freqs = np.fft.fftfreq(len(audio_data), 1/sample_rate)
    
    # Analyze power in different frequency bands
    low_freq_power = np.sum(np.abs(fft[(freqs > 0) & (freqs < 1000)]))
    mid_freq_power = np.sum(np.abs(fft[(freqs >= 1000) & (freqs < 4000)]))
    high_freq_power = np.sum(np.abs(fft[(freqs >= 4000) & (freqs < 8000)]))
    
    # Simple heuristic: more high frequencies might indicate closer/front
    # This is a placeholder - real implementation needs mic array
    total_power = low_freq_power + mid_freq_power + high_freq_power
    
    if total_power < 1e-6:
        return "unknown"
    
    # Estimate based on spectral characteristics
    high_ratio = high_freq_power / total_power
    
    if high_ratio > 0.4:
        return "front"
    elif high_ratio > 0.25:
        return "center"
    else:
        return "back"

def separate_speakers_simple(audio_data, sample_rate):
    """
    Simple speaker separation using spectral clustering.
    In production, use pyannote.audio or Demucs for better results.
    """
    # This is a simplified version
    # Real implementation would use:
    # - pyannote.audio for speaker diarization
    # - Demucs for source separation
    # - Whisper for transcription
    
    # For now, we'll segment by energy and estimate speakers
    frame_length = int(sample_rate * 0.025)  # 25ms frames
    hop_length = int(sample_rate * 0.010)    # 10ms hop
    
    # Calculate energy per frame
    energy = []
    for i in range(0, len(audio_data) - frame_length, hop_length):
        frame = audio_data[i:i+frame_length]
        energy.append(np.sum(frame ** 2))
    
    energy = np.array(energy)
    
    # Simple voice activity detection
    threshold = np.percentile(energy, 30)
    voice_frames = energy > threshold
    
    # Group consecutive voice frames into segments
    segments = []
    in_segment = False
    start_idx = 0
    
    for i, is_voice in enumerate(voice_frames):
        if is_voice and not in_segment:
            start_idx = i
            in_segment = True
        elif not is_voice and in_segment:
            segments.append((start_idx * hop_length, i * hop_length))
            in_segment = False
    
    if in_segment:
        segments.append((start_idx * hop_length, len(audio_data)))
    
    return segments

async def transcribe_audio_segment(audio_bytes, sample_rate):
    """Transcribe audio using Gemini or Whisper API"""
    # For now, we'll use Gemini's audio capabilities
    # In production, you might want to use OpenAI Whisper API
    
    if not GEMINI_API_KEY:
        return "API key not configured"
    
    # Convert audio to base64 for Gemini
    import base64
    audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
    
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    )
    
    # Note: Gemini's audio API might have different format
    # This is a placeholder - adjust based on actual API
    json_data = {
        "contents": [{
            "parts": [{
                "text": "Transcribe this audio segment."
            }]
        }]
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=json_data)
            if response.status_code == 200:
                data = response.json()
                return data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    except Exception as e:
        print(f"Transcription error: {e}")
    
    return ""

async def label_spatial_position(speakers_data):
    """Use Gemini to intelligently label speaker positions"""
    if not GEMINI_API_KEY:
        return speakers_data
    
    prompt = (
        "You are helping label speakers in a room for a blind person. "
        "Based on the detected speakers and their characteristics, provide spatial labels.\n\n"
        "Detected speakers:\n"
    )
    
    for i, speaker in enumerate(speakers_data):
        prompt += (
            f"Speaker {i+1}: direction={speaker.get('direction', 'unknown')}, "
            f"duration={speaker.get('duration', 0):.1f}s\n"
        )
    
    prompt += (
        "\nProvide labels like 'Man on your left', 'Teacher at the front', "
        "'Student near door', etc. Return JSON array with 'label' field for each speaker."
    )
    
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    )
    
    json_data = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=json_data)
            if response.status_code == 200:
                data = response.json()
                result_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                
                # Try to parse JSON from response
                import json
                import re
                json_match = re.search(r'\[.*\]', result_text, re.DOTALL)
                if json_match:
                    labels = json.loads(json_match.group())
                    for i, label_data in enumerate(labels):
                        if i < len(speakers_data):
                            speakers_data[i]['spatial_label'] = label_data.get('label', f'Speaker {i+1}')
    except Exception as e:
        print(f"Labeling error: {e}")
    
    return speakers_data

async def process_audio(file: UploadFile = File(...)):
    """
    Process audio file to separate speakers and provide spatial captions.
    """
    try:
        # Read audio file
        audio_bytes = await file.read()
        
        # Save to temporary file for librosa
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
            tmp_file.write(audio_bytes)
            tmp_path = tmp_file.name
        
        try:
            # Load audio
            audio_data, sample_rate = librosa.load(tmp_path, sr=16000, mono=False)
            
            # If stereo, use both channels for direction estimation
            if len(audio_data.shape) > 1:
                # Estimate direction from stereo channels
                left_channel = audio_data[0] if audio_data.shape[0] > 0 else audio_data
                right_channel = audio_data[1] if audio_data.shape[0] > 1 else audio_data
                
                # Simple phase difference for direction
                correlation = np.corrcoef(left_channel[:min(len(left_channel), len(right_channel))], 
                                         right_channel[:min(len(left_channel), len(right_channel))])[0, 1]
                
                if correlation > 0.8:
                    direction = "center"
                elif np.mean(left_channel) > np.mean(right_channel) * 1.2:
                    direction = "left"
                elif np.mean(right_channel) > np.mean(left_channel) * 1.2:
                    direction = "right"
                else:
                    direction = "center"
                
                audio_data = np.mean(audio_data, axis=0)  # Convert to mono for processing
            else:
                direction = estimate_speaker_direction(audio_data, sample_rate)
            
            # Separate speakers (simplified)
            segments = separate_speakers_simple(audio_data, sample_rate)
            
            # Process each segment
            speakers = []
            for i, (start, end) in enumerate(segments[:5]):  # Limit to 5 speakers
                segment_audio = audio_data[start:end]
                
                # Estimate direction for this segment
                seg_direction = estimate_speaker_direction(segment_audio, sample_rate)
                
                # Convert segment back to bytes for transcription
                segment_bytes = (segment_audio * 32767).astype(np.int16).tobytes()
                
                # Transcribe (placeholder - implement actual transcription)
                # For now, we'll skip transcription and use Gemini for labeling
                text = ""  # await transcribe_audio_segment(segment_bytes, sample_rate)
                
                duration = (end - start) / sample_rate
                
                speakers.append({
                    "id": i,
                    "direction": seg_direction or direction,
                    "duration": duration,
                    "text": text,
                    "start_time": start / sample_rate,
                    "end_time": end / sample_rate
                })
            
            # Use Gemini to label spatial positions
            speakers = await label_spatial_position(speakers)
            
            return {
                "speakers": speakers,
                "total_duration": len(audio_data) / sample_rate,
                "sample_rate": sample_rate
            }
            
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
                
    except Exception as e:
        print(f"Audio processing error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "error": str(e),
            "speakers": []
        }

