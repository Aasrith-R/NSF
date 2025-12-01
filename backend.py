import cv2
import pyttsx3
from ultralytics import YOLO
import time
import asyncio
import httpx  # for async HTTP calls

# Initialize text-to-speech engine
engine = pyttsx3.init()
engine.setProperty('rate', 150)

# Load YOLOv8 model
yolo_model = YOLO("yolov8n.pt")

cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("[ERROR] Cannot open webcam")
    exit()

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

# -------------------------
# FIXED GEMINI FUNCTION
# -------------------------
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

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.5-flash:generateContent?key=AIzaSyD3eDzwApWWRAnKspMF6x4xVwajrwRvDKc"
    )

    json_data = {
        "contents": [
            {
                "parts": [ {"text": prompt} ]
            }
        ]
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=json_data)
        response.raise_for_status()
        data = response.json()
        # Correct Gemini output path
        return data["candidates"][0]["content"]["parts"][0]["text"]

# -------------------------
# MAIN LOOP
# -------------------------
async def main_loop():
    last_spoken_time = 0
    speak_interval = 5
    alert_cache = ""

    while True:
        ret, frame = cap.read()
        if not ret:
            break

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

            color = (0, 255, 0)
            if risk == "danger":
                color = (0, 0, 255)
            elif risk == "caution":
                color = (0, 255, 255)

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                frame,
                f"{label} {distance}m {direction} {risk}",
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                2,
            )

        cv2.imshow("Camera Detection", frame)

        # Speak updates every 5 seconds
        if time.time() - last_spoken_time > speak_interval and objects:
            alert_text = await query_gemini(objects)
            if alert_text and alert_text != alert_cache:
                engine.say(alert_text)
                engine.runAndWait()
                alert_cache = alert_text
            last_spoken_time = time.time()

        if cv2.waitKey(1) & 0xFF == 27:  # ESC key to exit
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    asyncio.run(main_loop())
