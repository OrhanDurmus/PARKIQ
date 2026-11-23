#!/usr/bin/env python3
"""Capture the Android compositor and check the Mapbox viewport."""
import io
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageChops

COMPONENT = "tr.com.rotapark.app/.RotaparkNativeMapActivity"
PROBE_COLOR = (41, 123, 99)


def adb(*args):
    return subprocess.check_output(["adb", *args], timeout=40)


def capture(path):
    png = adb("exec-out", "screencap", "-p")
    path.write_bytes(png)
    image = Image.open(io.BytesIO(png)).convert("RGB")
    width, height = image.size
    return image.crop((width * 15 // 100, height * 35 // 100,
                       width * 85 // 100, height * 75 // 100))


def metrics(image):
    pixels = list(image.getdata())
    bins = {tuple(channel // 16 for channel in pixel) for pixel in pixels}
    dominant = max(count for count, _ in image.getcolors(len(pixels))) / len(pixels)
    previous = image.crop((0, 0, image.width - 1, image.height))
    following = image.crop((1, 0, image.width, image.height))
    edge = sum(max(pixel) >= 12 for pixel in ImageChops.difference(
        previous, following).getdata()) / (previous.width * previous.height)
    probe = sum(max(abs(a - b) for a, b in zip(pixel, PROBE_COLOR)) <= 8
                for pixel in pixels) / len(pixels)
    return dict(color_bins=len(bins), dominant_fraction=dominant,
                edge_fraction=edge, probe_fraction=probe)


def map_drawn(result):
    return (result["color_bins"] >= 12 and result["dominant_fraction"] < 0.85
            and result["edge_fraction"] >= 0.008)


def launch(case):
    adb("logcat", "-c")
    adb("shell", "am", "force-stop", "tr.com.rotapark.app")
    args = ("--es", "mapbox_visual_test", case) if case != "satellite" else ()
    output = adb("shell", "am", "start", "-W", "-n", COMPONENT, *args).decode()
    if "Status: ok" not in output:
        raise RuntimeError(output)


def collect_diagnostics(path):
    log = adb("logcat", "-d", "-t", "2500").decode(errors="replace")
    lines = [line for line in log.splitlines()
             if re.search(r"ROTAPARK_NATIVE|MapboxLifecyclePlugin|EGL_|eglCreate|OpenGLRenderer|FATAL EXCEPTION", line)]
    safe = re.sub(r"(?:pk|sk)\.[A-Za-z0-9._-]+", "[redacted]", "\n".join(lines))
    path.write_text(safe + "\n")
    return safe


def run_case(case, out):
    try:
        launch(case)
        probe = case.startswith("probe-")
        image_path = out / f"{case}.png"
        deadline = time.monotonic() + (20 if probe else 85)
        while True:
            image = capture(image_path)
            result = metrics(image)
            drawn = result["probe_fraction"] >= 0.9 if probe else map_drawn(result)
            if drawn or time.monotonic() >= deadline:
                break
            time.sleep(3)

        if drawn and not probe:
            display = Image.open(image_path)
            width, height = display.size
            display.close()
            adb("shell", "input", "swipe", str(width * 2 // 3), str(height // 2),
                str(width // 3), str(height // 2), "500")
            time.sleep(5)
            moved = capture(out / f"{case}-panned.png")
            change = ImageChops.difference(image, moved)
            changed = sum(max(pixel) >= 16 for pixel in change.getdata()) / (
                image.width * image.height)
            result["panned"] = metrics(moved)
            result["pan_changed_fraction"] = changed
            drawn = changed >= 0.08 and map_drawn(result["panned"])
        result["pixels_passed"] = drawn
    finally:
        log = collect_diagnostics(out / f"{case}.log")
    expected_renderer = "false" if case in ("probe-surface", "probe-legacy-theme") else "true"
    result["renderer_logged"] = f"RENDER_CONFIG: texture={expected_renderer}" in log
    result["hardware_accelerated"] = "HW_ACCELERATED: true" in log
    result["passed"] = drawn and result["renderer_logged"] and result["hardware_accelerated"]
    return result


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    surface_flinger = adb("shell", "dumpsys", "SurfaceFlinger").decode(errors="replace")
    (out / "emulator-graphics.txt").write_text(
        adb("shell", "wm", "size").decode() + adb("shell", "wm", "density").decode()
        + "\n".join(line for line in surface_flinger.splitlines()
                    if "GLES:" in line or "EGL" in line) + "\n")
    results = {}
    for case in ("probe-legacy-theme", "probe-surface", "probe-texture", "satellite", "streets"):
        try:
            results[case] = run_case(case, out)
        except (OSError, RuntimeError, subprocess.SubprocessError) as error:
            results[case] = {"passed": False, "error": str(error)}
        print(f"{case} {json.dumps(results[case])}", flush=True)
    (out / "pixel-results.json").write_text(json.dumps(results, indent=2) + "\n")
    return 0 if all(results[case]["passed"] for case in
                    ("probe-texture", "satellite", "streets")) else 1


if __name__ == "__main__":
    sys.exit(main())
