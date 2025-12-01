from fastapi import FastAPI, File, UploadFile, Form
from ultralytics import YOLO
import numpy as np
import cv2
import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

app = FastAPI()
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
        "You are a mobility assistant speaking to a blind user. "
        "Prioritize hazards by risk level and give direct guidance (e.g., 'Step left', 'Pause', 'Safe to proceed'). "
        "Mention each object with distance in meters, direction (left/center/right), and what action to take. "
        "Keep it to 1–2 concise sentences, urgent risks first."
        "\n\nDetected objects:\n"
    )
    for obj in detected_objects:
        prompt += (
            f"- {obj['label']} at {obj['distance']}m, "
            f"risk: {obj['risk']}, direction: {obj['direction']}\n"
        )
    prompt += "\nRespond in 1–2 short sentences, with urgent risks first."

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    json_data = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        timeout = httpx.Timeout(10.0, connect=10.0, read=10.0, write=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=json_data)
            response.raise_for_status()
            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception:
        return "Area ahead may be clear. Move forward with caution and check surroundings."

async def query_gemini_for_question(question, detected_objects):
    prompt = (
        "You are a mobility assistant speaking to a blind user. "
        "The user asked a question about their surroundings. "
        "Use only the detected objects listed below to answer. "
        "If the requested thing is visible, answer with a single, clear sentence that describes where it is, "
        "using approximate distance in feet and direction (left/center/right), e.g., 'About 15 feet ahead, slightly right.' "
        "If it is not visible, clearly say you do not see it in this view.\n\n"
        f"User question: {question}\n\n"
        "Detected objects (each has label, distance in meters, direction, and risk):\n"
    )
    for obj in detected_objects:
        prompt += (
            f"- {obj['label']} at {obj['distance']}m, "
            f"risk: {obj['risk']}, direction: {obj['direction']}\n"
        )
    prompt += (
        "\nRespond with just one spoken-style sentence, no bullet points, "
        "and do not mention that you are an AI."
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    json_data = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        timeout = httpx.Timeout(10.0, connect=10.0, read=10.0, write=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=json_data)
            response.raise_for_status()
            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception:
        return "I cannot answer that precisely right now, but use the nearest objects ahead as a guide."

@app.post("/detect/")
async def detect(file: UploadFile = File(...)):
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

    if not objects:
        return {"objects": [], "alert_text": "Area looks clear ahead. Move forward at your pace."}

    alert_text = await query_gemini(objects)
    return {"objects": objects, "alert_text": alert_text}

@app.post("/smart_query/")
async def smart_query(
    file: UploadFile = File(...),
    question: str = Form(...),
):
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

    if not objects:
        answer_text = "I don't clearly see anything related to your question in this view."
        return {
            "objects": [],
            "answer_text": answer_text,
            "question": question,
        }

    answer_text = await query_gemini_for_question(question, objects)
    return {
        "objects": objects,
        "answer_text": answer_text,
        "question": question,
    }
