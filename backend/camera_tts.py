from fastapi import FastAPI, File, UploadFile
from ultralytics import YOLO
import numpy as np
import cv2
import io
import asyncio
import httpx
import os
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()  # loads .env file into environment variables

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

yolo_model = YOLO("yolov8n.pt")

def get_direction(bbox, width):
    x1, _, x2, _ = bbox
    mid = (x1 + x2) / 2
    if mid < width * 0.33:
        return "left"
    elif mid > width * 0.66:
        return "right"
    return "center"

def estimate_distance_from_bbox(bbox, frame_height):
    x1, y1, x2, y2 = bbox
    box_height = y2 - y1
    relative_height = box_height / frame_height
    distance = max(0.2, 3 * (1 - relative_height))
    return round(distance, 2)

async def query_gemini(detected_objects):
    prompt = (
        "You are assisting a blind person by describing objects from their camera. "
        "List objects with distances, risk levels, and directions. Provide a short warning."
        "\n\nDetected objects:\n"
    )
    for obj in detected_objects:
        prompt += (
            f"- {obj['label']} at {obj['distance']}m, "
            f"risk: {obj['risk']}, direction: {obj['direction']}\n"
        )
    prompt += "\nRespond in 1–2 short sentences, with urgent risks first."
    
    if not GEMINI_API_KEY:
        return "API key not configured. Please set GEMINI_API_KEY in your .env file."
    
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    )
    json_data = {
        "contents": [
            {"parts": [{"text": prompt}]}
        ]
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=json_data)
        if response.status_code != 200:
            error_detail = response.text
            print(f"Gemini API error: {response.status_code} - {error_detail}")
            # Return a fallback message instead of crashing
            return f"Warning: {len(detected_objects)} object(s) detected nearby. Please proceed with caution."
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]

@app.post("/detect/")
async def detect(file: UploadFile = File(...)):
    # Read image bytes
    contents = await file.read()
    np_arr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    h, w, _ = frame.shape

    results = yolo_model(frame, verbose=False)[0]
    objects = []
    for box in results.boxes:
        cls = int(box.cls[0])
        label = yolo_model.names[cls]
        conf = float(box.conf[0])

        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
        x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)

        distance = estimate_distance_from_bbox((x1, y1, x2, y2), h)
        direction = get_direction((x1, y1, x2, y2), w)

        if distance < 0.7:
            risk = "danger"
        elif distance < 1.5:
            risk = "caution"
        else:
            risk = "clear"

        objects.append({
            "label": label,
            "confidence": conf,
            "distance": distance,
            "direction": direction,
            "risk": risk,
            "bbox": (x1, y1, x2, y2)
        })

    # Query Gemini for a summary
    alert_text = await query_gemini(objects)

    return {
        "objects": objects,
        "alert_text": alert_text
    }

@app.post("/process-audio/")
async def process_audio_endpoint(file: UploadFile = File(...)):
    """Process audio for speaker separation and spatial captioning"""
    try:
        from audio_processing import process_audio
        return await process_audio(file)
    except ImportError as e:
        return {
            "error": f"Audio processing module not available: {str(e)}",
            "speakers": []
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
