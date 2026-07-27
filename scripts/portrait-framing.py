#!/usr/bin/env python3
"""Optional local subject framing adapter.

This file deliberately has no required project dependency. Install OpenCV,
Ultralytics, and a local YOLO model to enable --auto; the Node wrapper falls
back to a reviewable center plan when they are unavailable.
"""
import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--video', required=True)
    parser.add_argument('--model', required=True)
    args = parser.parse_args()

    try:
        import cv2
        from ultralytics import YOLO
    except ImportError as exc:
        print(f'optional detector unavailable: {exc}', file=sys.stderr)
        return 2

    try:
        model = YOLO(args.model)
        capture = cv2.VideoCapture(args.video)
        if not capture.isOpened():
            raise RuntimeError('Could not open video.')
        frame_count = max(1, int(capture.get(cv2.CAP_PROP_FRAME_COUNT)))
        fps = capture.get(cv2.CAP_PROP_FPS) or 30
        keyframes = []
        for index in range(9):
            frame_index = int((frame_count - 1) * index / 8)
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ok, frame = capture.read()
            if not ok:
                continue
            result = model(frame, verbose=False)[0]
            candidates = []
            for box in result.boxes:
                if int(box.cls[0]) != 0:
                    continue
                x1, y1, x2, y2 = [float(value) for value in box.xyxy[0]]
                confidence = float(box.conf[0])
                area = max(0, x2 - x1) * max(0, y2 - y1)
                candidates.append((area, (x1 + x2) / 2 / max(1, frame.shape[1]), confidence))
            if candidates:
                _, center_x, confidence = max(candidates)
                keyframes.append({
                    'at': index / 8,
                    'centerX': max(0.05, min(0.95, center_x)),
                    'confidence': round(confidence, 4),
                })
        capture.release()
        if not keyframes:
            raise RuntimeError('No person detections found.')
        print(json.dumps({
            'schemaVersion': 1,
            'source': 'detector',
            'strategy': 'track',
            'confidence': round(sum(item['confidence'] for item in keyframes) / len(keyframes), 4),
            'keyframes': keyframes,
        }))
        return 0
    except Exception as exc:
        print(f'detector failed: {exc}', file=sys.stderr)
        return 3


if __name__ == '__main__':
    raise SystemExit(main())
