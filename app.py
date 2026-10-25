"""
==============================================================================
 FloraMind AI — Your Intelligent Plant Companion
 app.py | Optional Flask backend (mock AI engine)
------------------------------------------------------------------------------
 The website is fully functional as a static page (open index.html directly).
 This server adds a basic Python AI layer:

   GET  /health    -> {"status": "ok"}          (used by the front-end probe)
   POST /analyze   -> mock plant health analysis JSON
   POST /chat      -> mock AI plant advice for a chat message
   GET  /          -> serves index.html (so `python app.py` runs everything)

 The mock engine is deliberately rule-based: no paid API and no API keys.
------------------------------------------------------------------------------
 Run:
     pip install flask
     python app.py
 Then open http://127.0.0.1:5000  (the static index.html also auto-detects it)
==============================================================================
"""

import math
import random
from datetime import datetime

from flask import Flask, jsonify, request, send_from_directory

# --------------------------------------------------------------------------
# App setup — the front-end files live next to this script, so we serve them
# straight from the project root instead of the default /static folder.
# --------------------------------------------------------------------------
app = Flask(__name__, static_folder=None)

ALLOWED_METHODS = "GET, POST, OPTIONS"
ALLOWED_HEADERS = "Content-Type"


@app.after_request
def add_cors_headers(response):
    """Allow index.html opened from disk (file://) to call this local API."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS
    response.headers["Access-Control-Allow-Headers"] = ALLOWED_HEADERS
    return response


# --------------------------------------------------------------------------
# Static file serving
# --------------------------------------------------------------------------
@app.route("/")
def index():
    """Serve the single-page front-end."""
    return send_from_directory(".", "index.html")


@app.route("/<path:filename>")
def assets(filename):
    """Serve style.css, script.js and any other project asset."""
    return send_from_directory(".", filename)


# --------------------------------------------------------------------------
# Mock knowledge base used by /analyze
# --------------------------------------------------------------------------
SPECIES = [
    {"name": "Monstera Deliciosa", "scientific": "Monstera deliciosa", "emoji": "\U0001F33F", "water": "Every 7 days", "light": "Bright indirect"},
    {"name": "Snake Plant",        "scientific": "Dracaena trifasciata", "emoji": "\U0001FAB4", "water": "Every 14 days", "light": "Low to bright"},
    {"name": "Peace Lily",         "scientific": "Spathiphyllum wallisii", "emoji": "\U0001F33C", "water": "Every 5 days", "light": "Medium indirect"},
    {"name": "Fiddle Leaf Fig",    "scientific": "Ficus lyrata", "emoji": "\U0001F333", "water": "Every 8 days", "light": "Bright indirect"},
    {"name": "Aloe Vera",          "scientific": "Aloe barbadensis", "emoji": "\U0001F335", "water": "Every 18 days", "light": "Direct sun"},
    {"name": "Boston Fern",        "scientific": "Nephrolepis exaltata", "emoji": "\U0001F331", "water": "Every 3 days", "light": "Filtered shade"},
    {"name": "Rubber Plant",       "scientific": "Ficus elastica", "emoji": "\U0001F343", "water": "Every 9 days", "light": "Medium indirect"},
    {"name": "ZZ Plant",           "scientific": "Zamioculcas zamiifolia", "emoji": "\U0001F33E", "water": "Every 16 days", "light": "Low light"},
]

# severity is one of: none | warning | danger
CONDITIONS = [
    {"name": "Healthy Foliage", "severity": "none", "emoji": "\U0001F31F",
     "advice": ["Maintain the current watering rhythm",
                "Rotate the pot weekly for even light",
                "Wipe leaves monthly to keep pores open"]},
    {"name": "Overwatering / Root Stress", "severity": "warning", "emoji": "\U0001F4A7",
     "advice": ["Let the top 3 cm of soil dry out completely",
                "Check that the drainage holes are not blocked",
                "Reduce watering frequency by 30% for two weeks"]},
    {"name": "Nitrogen Deficiency", "severity": "warning", "emoji": "\U0001F343",
     "advice": ["Apply a balanced 10-10-10 fertiliser at half strength",
                "Yellow lower leaves indicate mobile nutrient loss",
                "Re-check in 10 days for new growth"]},
    {"name": "Leaf Spot Fungus", "severity": "danger", "emoji": "\U0001F9A0",
     "advice": ["Remove and bin affected leaves (never compost them)",
                "Improve air circulation around the plant",
                "Apply a copper-based fungicide every 7 days"]},
    {"name": "Spider Mite Infestation", "severity": "danger", "emoji": "\U0001F577",
     "advice": ["Rinse the undersides of the leaves with lukewarm water",
                "Apply neem oil spray in the evening",
                "Isolate from other plants for two weeks"]},
    {"name": "Sunburn / Scorched Tips", "severity": "warning", "emoji": "\u2600",
     "advice": ["Move 60 cm away from the window during peak hours",
                "Raise humidity with a pebble tray",
                "Trim fully brown tips with clean scissors"]},
    {"name": "Low Light Etiolation", "severity": "warning", "emoji": "\U0001F4A1",
     "advice": ["Relocate to a brighter spot with indirect light",
                "Long stretched stems mean the plant is reaching for sun",
                "Consider a 12W full-spectrum LED for 6h a day"]},
]


def analyse_metrics(seed: int, metrics: dict) -> dict:
    """Rule-based analysis: pixel metrics -> health score -> diagnosis.

    The same formulas run in the browser (script.js) so results stay
    consistent whether or not this server is running.
    """
    green = float(metrics.get("greenRatio", 0.46))
    dark = float(metrics.get("darkRatio", 0.12))
    bright = float(metrics.get("brightRatio", 0.08))

    plant = SPECIES[seed % len(SPECIES)]

    # Health score: green coverage helps, shadow and blown highlights hurt
    health = 52 + green * 62 - dark * 46 - bright * 22
    health = int(max(28, min(99, round(health))))

    # Confidence grows with a cleaner green signal
    confidence = round(min(98.7, 74 + green * 30 - dark * 12), 1)

    # Pick the diagnosis from the seed + health band
    roll = (seed % 100) / 100.0
    if health >= 84:
        condition = CONDITIONS[0]
    elif roll < 0.34:
        condition = CONDITIONS[3] if health < 60 else CONDITIONS[1]
    elif roll < 0.58:
        condition = CONDITIONS[2]
    elif roll < 0.76:
        condition = CONDITIONS[4]
    elif roll < 0.90:
        condition = CONDITIONS[5]
    else:
        condition = CONDITIONS[6]

    return {
        "source": "flake",
        "plant": plant["name"],
        "scientific": plant["scientific"],
        "emoji": plant["emoji"],
        "health": health,
        "confidence": confidence,
        "condition": condition["name"],
        "severity": condition["severity"],
        "diseaseEmoji": condition["emoji"],
        "watering": plant["water"],
        "light": plant["light"],
        "humidity": "45-60%" if health > 80 else "55-70%",
        "soilPh": round(random.uniform(5.8, 6.9), 1),
        "lastChecked": datetime.now().strftime("%d %b %Y, %H:%M"),
        "tips": condition["advice"],
        "metrics": {
            "greenCoverage": round(green * 100, 1),
            "shadowAreas": round(dark * 100, 1),
            "specularSpots": round(bright * 100, 1),
        },
    }


# --------------------------------------------------------------------------
# Mock knowledge base used by /chat
# --------------------------------------------------------------------------
CHAT_KB = [
    (["yellow", "yellowing", "yellowish"],
     "Yellow leaves usually mean overwatering, a nitrogen deficiency or too much direct sun. "
     "Check the soil 3 cm deep: if it is soggy, pause watering for 5 days. If only the lower "
     "leaves turn yellow, feed a balanced 10-10-10 fertiliser at half strength and re-check in 10 days."),
    (["brown", "crispy", "tips", "edges"],
     "Brown crispy tips point to low humidity or salt build-up. Trim the dead edges with clean "
     "scissors, raise humidity to 55-65% with a pebble tray, and flush the pot with distilled "
     "water once a month."),
    (["water", "watering", "how often", "thirsty"],
     "Water by feel, not by calendar. Push a finger 3 cm into the soil: dry means water, damp means "
     "wait. As a baseline, tropical foliage needs water every 5-7 days and succulents every 14-18 days."),
    (["overwater", "root rot", "soggy", "mushy"],
     "Overwatering is the number one houseplant killer. Remove the plant, cut away brown mushy roots, "
     "repot into a gritty mix and skip watering for 7 days. Always empty the saucer after watering."),
    (["light", "sunlight", "sun", "dark", "shade", "window"],
     "Bright indirect light suits about 80% of houseplants: 1-2 m from a south or east window, out of "
     "the direct beam. Stretched stems with wide gaps between leaves mean the plant is reaching for light."),
    (["fertilizer", "fertiliser", "feed", "nutrient", "npk"],
     "Feed only during active growth. Use a balanced 10-10-10 at half strength every 3-4 weeks for "
     "foliage plants and a 2-3-4 blend for flowering plants. Never feed a dry or stressed plant."),
    (["pest", "bugs", "mites", "gnat", "aphid", "mealy"],
     "Check under the leaves first. Fine webbing means spider mites, white fluff means mealybugs and "
     "tiny black flies mean fungus gnats from wet soil. Wipe with isopropyl alcohol, spray neem oil in "
     "the evening and isolate the plant for two weeks."),
    (["repot", "pot", "soil", "transplant"],
     "Repot when roots circle the drainage holes, usually every 12-18 months. Choose a pot only 2-4 cm "
     "wider, use a mix with perlite and bark, and skip fertiliser for the first month."),
    (["humidity", "mist", "dry air"],
     "Most tropicals are happy at 50-65% relative humidity. Below 40% you will see brown tips. Use a "
     "pebble tray, group plants together or run a humidifier. Avoid misting succulents."),
    (["propagate", "cutting", "clone"],
     "Take a cutting with 1-2 nodes, remove the lower leaves and root it in water or damp sphagnum moss. "
     "Keep it in bright indirect light at 22-25 C and change the water every 4 days."),
    (["drooping", "wilting", "wilt"],
     "Drooping has two opposite causes. Bone-dry soil means water it and check again in 2 hours. Wet soil "
     "with a drooping plant means root damage: stop watering and improve drainage immediately."),
    (["help", "hello", "hi", "hey", "what can you do"],
     "I can diagnose yellowing or browning leaves, build a watering schedule, calculate fertiliser dosage, "
     "identify pests and match plants to your light conditions. Ask me anything about your garden."),
]

GENERIC_REPLIES = [
    "I could not match that to a known symptom. Safe checklist: check the soil 3 cm deep, confirm the "
    "light level and inspect under the leaves for pests. Tell me the leaf colour and where it appears "
    "and I can narrow it down.",
    "Tell me a little more: what does the leaf look like (yellow, brown, curling, spots), how often do "
    "you water and how much light does the plant get?",
]


def chat_reply(message: str) -> str:
    """Score the message against keyword tags and return the best answer."""
    text = (message or "").lower()
    best_score = 0
    best_answer = None

    for tags, answer in CHAT_KB:
        score = sum(len(tag) for tag in tags if tag in text)
        if score > best_score:
            best_score = score
            best_answer = answer

    return best_answer or random.choice(GENERIC_REPLIES)


# --------------------------------------------------------------------------
# API endpoints
# --------------------------------------------------------------------------
@app.route("/health", methods=["GET", "OPTIONS"])
def health():
    """Tiny probe endpoint so the front-end knows the Python engine is up."""
    if request.method == "OPTIONS":
        return ("", 204)
    return jsonify({"status": "ok", "engine": "flask-mock-ai", "version": "1.0"})


@app.route("/analyze", methods=["POST", "OPTIONS"])
def analyze():
    """Mock plant health analysis.

    Expected JSON body:
        {
          "seed": 123456789,                              # deterministic tie-breaker
          "metrics": {"greenRatio": .46, "darkRatio": .12, "brightRatio": .08},
          "filename": "leaf.jpg"                          # optional
        }
    """
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    seed = int(payload.get("seed") or random.randint(1, 10_000_000))
    metrics = payload.get("metrics") or {}

    result = analyse_metrics(seed, metrics)
    result["filename"] = payload.get("filename", "upload.jpg")
    return jsonify(result)


@app.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    """Mock AI chat advice.

    Expected JSON body: {"message": "my plant leaves are yellow"}
    """
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "")

    return jsonify({
        "reply": chat_reply(message),
        "source": "flake",
        "engine": "flask-mock-ai"
    })


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 68)
    print(" FloraMind AI — Flask mock AI engine")
    print(" Open  http://127.0.0.1:5000  in your browser")
    print(" Endpoints: GET /health  |  POST /analyze  |  POST /chat")
    print("=" * 68)
    app.run(host="127.0.0.1", port=5000, debug=True)
