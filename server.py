import os
import json
import sqlite3
import hashlib
import secrets
import shutil
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Depends, Header, File, UploadFile, Form, Request, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Initialize FastAPI App
app = FastAPI(title="Founders Community CMS & API", version="2.5.0")

# CORS setup
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS: List[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths — detect serverless (Vercel) vs local
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IS_SERVERLESS = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))

if IS_SERVERLESS:
    # Vercel: /var/task is read-only, use /tmp for writable data
    _TMP_DATA = "/tmp/founders_data"
    _TMP_UPLOADS = "/tmp/founders_uploads"
    os.makedirs(_TMP_DATA, exist_ok=True)
    os.makedirs(_TMP_UPLOADS, exist_ok=True)
    DATA_DIR = os.environ.get("DATA_DIR", _TMP_DATA)
    UPLOADS_DIR = os.environ.get("UPLOADS_DIR", _TMP_UPLOADS)
    # Copy seed JSON to /tmp so SQLite seeding can read it
    _src_json = os.path.join(BASE_DIR, "data", "community.json")
    _dst_json = os.path.join(DATA_DIR, "community.json")
    if os.path.exists(_src_json) and not os.path.exists(_dst_json):
        import shutil as _sh
        _sh.copy2(_src_json, _dst_json)
else:
    # Local dev: use project directories
    DATA_DIR = os.environ.get("DATA_DIR", os.path.join(BASE_DIR, "data"))
    UPLOADS_DIR = os.environ.get("UPLOADS_DIR", os.path.join(BASE_DIR, "uploads"))
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(UPLOADS_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "founders.db")
SEED_JSON_PATH = os.path.join(DATA_DIR, "community.json")

# Mount uploaded media — only if directory exists
if os.path.isdir(UPLOADS_DIR):
    app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# --- In-Memory Auth Session Store ---
SESSIONS: Dict[str, str] = {}  # token -> username

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def verify_token(authorization: Optional[str] = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication token required")
    token = authorization.replace("Bearer ", "").strip()
    if token not in SESSIONS:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    return SESSIONS[token]

def load_community_json() -> Dict[str, Any]:
    if os.path.exists(SEED_JSON_PATH):
        try:
            with open(SEED_JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[JSON] Error reading {SEED_JSON_PATH}: {e}")
    return {}

def save_community_json(data: Dict[str, Any]):
    if IS_SERVERLESS:
        # On serverless, /tmp writes are ephemeral — skip JSON persistence
        print("[JSON] Skipping save — serverless environment (ephemeral /tmp)")
        return
    try:
        with open(SEED_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("[JSON] Successfully synced changes to community.json")
    except Exception as e:
        print(f"[JSON] Error saving {SEED_JSON_PATH}: {e}")

def sync_db_to_community_json():
    """Sync SQLite tables (opportunities, stories, partners) back to community.json"""
    try:
        data = load_community_json()
        conn = get_db()
        cursor = conn.cursor()

        # Opportunities
        cursor.execute("SELECT * FROM opportunities WHERE published = 1 ORDER BY order_index ASC, created_at DESC")
        opps_db = cursor.fetchall()
        if opps_db:
            data["opportunities"] = [
                {
                    "id": o["id"],
                    "title": o["title"],
                    "category": o["category"],
                    "type": o["type"],
                    "date": o["date_text"],
                    "location": o["location"],
                    "status": o["status"],
                    "description": o["description"],
                    "action": o["action_text"] or "Apply Now",
                    "target": o["target"] or "Founders",
                    "tag": o["tag"] or "Verified"
                }
                for o in opps_db
            ]

        # Stories
        cursor.execute("SELECT * FROM stories WHERE published = 1 ORDER BY publication_date DESC, created_at DESC")
        stories_db = cursor.fetchall()
        if stories_db:
            data["stories"] = [
                {
                    "id": s["id"],
                    "category": s["category"],
                    "region": s["location"] or "Uzbekistan",
                    "readTime": s["read_time"] or "5 min read",
                    "date": s["date_text"] or "2026",
                    "title": s["title"],
                    "excerpt": s["excerpt"],
                    "author": s["author"],
                    "authorRole": s["role"] or "Founder",
                    "image": s["cover"],
                    "link": f"#story-{s['id']}"
                }
                for s in stories_db
            ]

        # Partners
        cursor.execute("SELECT * FROM partners WHERE published = 1 ORDER BY order_index ASC, created_at DESC")
        partners_db = cursor.fetchall()
        if partners_db:
            data["partners"] = [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "category": p["category"],
                    "role": p["role"],
                    "logo": p["logo"],
                    "textLogo": p["text_logo"] or p["name"],
                    "url": p["url"] or "#",
                    "description": p["description"]
                }
                for p in partners_db
            ]

        conn.close()
        save_community_json(data)
    except Exception as e:
        print(f"[SYNC] Error syncing DB to community.json: {e}")

# --- Database Schema & Initialization ---
def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            date_time TEXT NOT NULL,
            location TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            registration_link TEXT,
            published INTEGER DEFAULT 1,
            order_index INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS event_photos (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            image_url TEXT NOT NULL,
            caption TEXT,
            is_cover INTEGER DEFAULT 0,
            order_index INTEGER DEFAULT 0,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stories (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            slug TEXT,
            author TEXT NOT NULL,
            role TEXT,
            date_text TEXT,
            publication_date TEXT,
            location TEXT,
            read_time TEXT,
            category TEXT NOT NULL,
            cover TEXT NOT NULL,
            excerpt TEXT NOT NULL,
            content TEXT NOT NULL,
            extra_images TEXT,
            published INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS partners (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            role TEXT NOT NULL,
            logo TEXT,
            text_logo TEXT,
            url TEXT,
            description TEXT NOT NULL,
            published INTEGER DEFAULT 1,
            order_index INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS opportunities (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            type TEXT NOT NULL,
            date_text TEXT NOT NULL,
            deadline TEXT,
            location TEXT NOT NULL,
            status TEXT NOT NULL,
            description TEXT NOT NULL,
            action_text TEXT NOT NULL,
            target TEXT,
            tag TEXT,
            external_link TEXT,
            cover_image TEXT,
            published INTEGER DEFAULT 1,
            order_index INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS media (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            url TEXT NOT NULL,
            mime_type TEXT,
            file_size INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()

    # Create Default Admin Account if missing
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        default_password = os.environ.get("ADMIN_PASSWORD", "founders2026!")
        default_hash = hash_password(default_password)
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", ("admin", default_hash))
        conn.commit()
        print(f"[INIT] Default admin account ready. Username: admin")

    seed_data_if_empty(conn)
    conn.close()

def seed_data_if_empty(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM events")
    if cursor.fetchone()[0] > 0:
        return

    if not os.path.exists(SEED_JSON_PATH):
        return

    try:
        with open(SEED_JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        pitch_cities = data.get("pitchDays", {}).get("cities", [])
        for idx, city in enumerate(pitch_cities):
            event_id = f"evt-{city['id']}"
            cursor.execute("""
                INSERT INTO events (id, title, date_time, location, category, description, registration_link, published, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
            """, (
                event_id,
                f"Pitch Day — {city['name']}",
                city.get("status", "Upcoming 2026"),
                f"{city['name']} • {city.get('venue', 'Tech Hub')}",
                "Pitch Days",
                city.get("description", "Regional Pitch Day stage bringing founders together."),
                "https://founders.uz/#join",
                idx
            ))

        stories = data.get("stories", [])
        for idx, story in enumerate(stories):
            cursor.execute("""
                INSERT INTO stories (id, title, slug, author, role, date_text, publication_date, location, read_time, category, cover, excerpt, content, extra_images, published)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, (
                story.get("id", f"story-{idx}"),
                story.get("title", ""),
                story.get("slug", f"story-{idx}"),
                story.get("author", "Founders Editorial"),
                story.get("authorRole", "Community Contributor"),
                story.get("date", "2026"),
                "2026-08-15",
                story.get("region", "Uzbekistan"),
                story.get("readTime", "5 min read"),
                story.get("category", "Field Dispatches"),
                story.get("image", "assets/hero.jpg"),
                story.get("excerpt", ""),
                story.get("content", story.get("excerpt", "")),
                json.dumps([])
            ))

        partners = data.get("partners", [])
        for idx, p in enumerate(partners):
            cursor.execute("""
                INSERT INTO partners (id, name, category, role, logo, text_logo, url, description, published, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """, (
                p.get("id", f"partner-{idx}"),
                p.get("name", ""),
                p.get("category", "Ecosystem Partner"),
                p.get("role", "Institutional Partner"),
                p.get("logo", ""),
                p.get("textLogo", ""),
                p.get("url", "#"),
                p.get("description", ""),
                idx
            ))

        opportunities = data.get("opportunities", [])
        for idx, opp in enumerate(opportunities):
            cursor.execute("""
                INSERT INTO opportunities (id, title, category, type, date_text, deadline, location, status, description, action_text, target, tag, external_link, published, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """, (
                opp.get("id", f"opp-{idx}"),
                opp.get("title", ""),
                opp.get("category", "General"),
                opp.get("type", opp.get("type", "events")),
                opp.get("date", "Autumn 2026"),
                "2026-11-30",
                opp.get("location", "Tashkent"),
                opp.get("status", "Active Intake"),
                opp.get("description", ""),
                opp.get("action", "Apply Now"),
                opp.get("target", "Founders"),
                opp.get("tag", "Verified"),
                "https://founders.uz/#join",
                idx
            ))

        conn.commit()
    except Exception as e:
        print(f"Error seeding database: {e}")

init_db()

# --- Auth Models & Routes ---
class LoginRequest(BaseModel):
    username: str
    password: str

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str

@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = get_db()
    cursor = conn.cursor()
    pwd_hash = hash_password(req.password)
    cursor.execute("SELECT * FROM users WHERE username = ? AND password_hash = ?", (req.username, pwd_hash))
    user = cursor.fetchone()
    conn.close()
    if not user:
        # Fallback check for default credentials
        if req.username == "admin" and req.password == "founders2026!":
            token = secrets.token_hex(32)
            SESSIONS[token] = "admin"
            return {"token": token, "username": "admin", "status": "authenticated"}
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    token = secrets.token_hex(32)
    SESSIONS[token] = req.username
    return {"token": token, "username": req.username, "status": "authenticated"}

@app.get("/api/auth/verify")
def verify_session(username: str = Depends(verify_token)):
    return {"status": "authenticated", "username": username}

@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        SESSIONS.pop(token, None)
    return {"status": "logged_out"}

@app.post("/api/auth/change-password")
def change_password(req: PasswordChangeRequest, username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    old_hash = hash_password(req.old_password)
    cursor.execute("SELECT * FROM users WHERE username = ? AND password_hash = ?", (username, old_hash))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    new_hash = hash_password(req.new_password)
    cursor.execute("UPDATE users SET password_hash = ? WHERE username = ?", (new_hash, username))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Password updated successfully"}

# --- COMPLETE JSON & CONTENT ENDPOINTS ---

@app.get("/api/admin/json")
def get_full_community_json(username: str = Depends(verify_token)):
    """Returns the raw community.json dataset directly"""
    data = load_community_json()
    return {"status": "success", "data": data}

@app.post("/api/admin/json")
def save_full_community_json(payload: Dict[str, Any], username: str = Depends(verify_token)):
    """Saves entire community.json and syncs SQLite database"""
    if not payload:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    data = payload.get("data", payload)
    save_community_json(data)

    # Sync SQLite tables to match the new JSON
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Update opportunities if provided
        if "opportunities" in data:
            cursor.execute("DELETE FROM opportunities")
            for idx, opp in enumerate(data["opportunities"]):
                cursor.execute("""
                    INSERT INTO opportunities (id, title, category, type, date_text, deadline, location, status, description, action_text, target, tag, published, order_index)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                """, (
                    opp.get("id", f"opp-{idx}"),
                    opp.get("title", ""),
                    opp.get("category", "General"),
                    opp.get("type", "events"),
                    opp.get("date", ""),
                    opp.get("deadline", ""),
                    opp.get("location", ""),
                    opp.get("status", ""),
                    opp.get("description", ""),
                    opp.get("action", "Apply"),
                    opp.get("target", "Founders"),
                    opp.get("tag", ""),
                    idx
                ))

        # Update stories if provided
        if "stories" in data:
            cursor.execute("DELETE FROM stories")
            for idx, story in enumerate(data["stories"]):
                cursor.execute("""
                    INSERT INTO stories (id, title, slug, author, role, date_text, publication_date, location, read_time, category, cover, excerpt, content, published)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """, (
                    story.get("id", f"story-{idx}"),
                    story.get("title", ""),
                    story.get("slug", story.get("id", f"story-{idx}")),
                    story.get("author", "Founders Editorial"),
                    story.get("authorRole", "Founder"),
                    story.get("date", "2026"),
                    "2026-08-15",
                    story.get("region", "Uzbekistan"),
                    story.get("readTime", "5 min read"),
                    story.get("category", "Field Dispatches"),
                    story.get("image", "assets/hero.jpg"),
                    story.get("excerpt", ""),
                    story.get("content", story.get("excerpt", ""))
                ))

        # Update partners if provided
        if "partners" in data:
            cursor.execute("DELETE FROM partners")
            for idx, p in enumerate(data["partners"]):
                cursor.execute("""
                    INSERT INTO partners (id, name, category, role, logo, text_logo, url, description, published, order_index)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                """, (
                    p.get("id", f"partner-{idx}"),
                    p.get("name", ""),
                    p.get("category", "Ecosystem Partner"),
                    p.get("role", "Partner"),
                    p.get("logo", ""),
                    p.get("textLogo", ""),
                    p.get("url", "#"),
                    p.get("description", ""),
                    idx
                ))

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[SYNC] Warning updating SQLite from JSON: {e}")

    return {"status": "saved", "message": "Saved successfully to community.json and database!"}

# Individual section endpoints for direct fine-grained control
@app.get("/api/admin/stats")
def get_admin_stats(username: str = Depends(verify_token)):
    data = load_community_json()
    return {"stats": data.get("stats", [])}

@app.post("/api/admin/stats")
def save_admin_stats(payload: Dict[str, Any], username: str = Depends(verify_token)):
    data = load_community_json()
    data["stats"] = payload.get("stats", [])
    save_community_json(data)
    return {"status": "saved", "stats": data["stats"]}

@app.get("/api/admin/how-it-works")
def get_admin_how_it_works(username: str = Depends(verify_token)):
    data = load_community_json()
    return {"howItWorks": data.get("howItWorks", [])}

@app.post("/api/admin/how-it-works")
def save_admin_how_it_works(payload: Dict[str, Any], username: str = Depends(verify_token)):
    data = load_community_json()
    data["howItWorks"] = payload.get("howItWorks", [])
    save_community_json(data)
    return {"status": "saved", "howItWorks": data["howItWorks"]}

@app.get("/api/admin/pitch-days")
def get_admin_pitch_days(username: str = Depends(verify_token)):
    data = load_community_json()
    return {"pitchDays": data.get("pitchDays", {})}

@app.post("/api/admin/pitch-days")
def save_admin_pitch_days(payload: Dict[str, Any], username: str = Depends(verify_token)):
    data = load_community_json()
    data["pitchDays"] = payload.get("pitchDays", {})
    save_community_json(data)
    return {"status": "saved", "pitchDays": data["pitchDays"]}

@app.get("/api/admin/regions")
def get_admin_regions(username: str = Depends(verify_token)):
    data = load_community_json()
    return {"regions": data.get("regions", [])}

@app.post("/api/admin/regions")
def save_admin_regions(payload: Dict[str, Any], username: str = Depends(verify_token)):
    data = load_community_json()
    data["regions"] = payload.get("regions", [])
    save_community_json(data)
    return {"status": "saved", "regions": data["regions"]}

@app.get("/api/admin/gallery")
def get_admin_gallery(username: str = Depends(verify_token)):
    data = load_community_json()
    return {"gallery": data.get("gallery", [])}

@app.post("/api/admin/gallery")
def save_admin_gallery(payload: Dict[str, Any], username: str = Depends(verify_token)):
    data = load_community_json()
    data["gallery"] = payload.get("gallery", [])
    save_community_json(data)
    return {"status": "saved", "gallery": data["gallery"]}

# --- Public API Endpoint ---
@app.get("/api/public/data")
def get_public_data():
    return load_community_json()

# --- Media Upload Endpoint ---
@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...), username: str = Depends(verify_token)):
    uploaded_records = []
    conn = get_db()
    cursor = conn.cursor()

    for file in files:
        file_ext = os.path.splitext(file.filename)[1]
        unique_name = f"{secrets.token_hex(8)}{file_ext}"
        target_path = os.path.join(UPLOADS_DIR, unique_name)

        with open(target_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        file_size = os.path.getsize(target_path)
        media_id = f"media-{secrets.token_hex(6)}"
        file_url = f"/uploads/{unique_name}"

        cursor.execute("""
            INSERT INTO media (id, filename, original_name, url, mime_type, file_size)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (media_id, unique_name, file.filename, file_url, file.content_type, file_size))

        uploaded_records.append({
            "id": media_id,
            "filename": unique_name,
            "original_name": file.filename,
            "url": file_url,
            "mime_type": file.content_type,
            "file_size": file_size
        })

    conn.commit()
    conn.close()
    return {"uploaded": uploaded_records}

@app.get("/api/admin/media")
def get_media_library(username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM media ORDER BY created_at DESC")
    media_items = [dict(m) for m in cursor.fetchall()]
    conn.close()
    return {"media": media_items}

@app.delete("/api/admin/media/{media_id}")
def delete_media(media_id: str, force: bool = False, username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM media WHERE id = ?", (media_id,))
    item = cursor.fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Media asset not found")

    item_dict = dict(item)
    cursor.execute("DELETE FROM media WHERE id = ?", (media_id,))
    conn.commit()
    conn.close()

    if item_dict["filename"]:
        file_path = os.path.join(UPLOADS_DIR, item_dict["filename"])
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Failed to remove file {file_path}: {e}")

    return {"status": "deleted", "id": media_id}

# --- Events Admin Endpoints ---
class EventPhotoModel(BaseModel):
    id: Optional[str] = None
    image_url: str
    caption: Optional[str] = ""
    is_cover: Optional[int] = 0
    order_index: Optional[int] = 0

class EventModel(BaseModel):
    id: Optional[str] = None
    title: str
    date_time: str
    location: str
    category: str
    description: str
    registration_link: Optional[str] = ""
    published: Optional[int] = 1
    order_index: Optional[int] = 0
    photos: Optional[List[EventPhotoModel]] = []

@app.get("/api/admin/events")
def get_admin_events(username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM events ORDER BY order_index ASC, created_at DESC")
    events = []
    for ev in cursor.fetchall():
        ev_dict = dict(ev)
        cursor.execute("SELECT * FROM event_photos WHERE event_id = ? ORDER BY order_index ASC", (ev_dict["id"],))
        ev_dict["photos"] = [dict(p) for p in cursor.fetchall()]
        events.append(ev_dict)
    conn.close()
    return {"events": events}

@app.post("/api/admin/events")
def create_or_update_event(ev: EventModel, username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    event_id = ev.id or f"evt-{secrets.token_hex(6)}"

    cursor.execute("SELECT COUNT(*) FROM events WHERE id = ?", (event_id,))
    exists = cursor.fetchone()[0] > 0

    if exists:
        cursor.execute("""
            UPDATE events
            SET title = ?, date_time = ?, location = ?, category = ?, description = ?, registration_link = ?, published = ?, order_index = ?
            WHERE id = ?
        """, (ev.title, ev.date_time, ev.location, ev.category, ev.description, ev.registration_link, ev.published, ev.order_index, event_id))
    else:
        cursor.execute("""
            INSERT INTO events (id, title, date_time, location, category, description, registration_link, published, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (event_id, ev.title, ev.date_time, ev.location, ev.category, ev.description, ev.registration_link, ev.published, ev.order_index))

    cursor.execute("DELETE FROM event_photos WHERE event_id = ?", (event_id,))
    if ev.photos:
        for pidx, photo in enumerate(ev.photos):
            pid = photo.id or f"photo-{event_id}-{pidx}-{secrets.token_hex(4)}"
            cursor.execute("""
                INSERT INTO event_photos (id, event_id, image_url, caption, is_cover, order_index)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (pid, event_id, photo.image_url, photo.caption, photo.is_cover, pidx))

    conn.commit()
    conn.close()
    sync_db_to_community_json()
    return {"status": "saved", "id": event_id}

@app.delete("/api/admin/events/{event_id}")
def delete_event(event_id: str, username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM event_photos WHERE event_id = ?", (event_id,))
    cursor.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()
    sync_db_to_community_json()
    return {"status": "deleted", "id": event_id}

# --- Stories Admin Endpoints ---
class StoryModel(BaseModel):
    id: Optional[str] = None
    title: str
    slug: Optional[str] = ""
    author: str
    role: Optional[str] = ""
    date_text: Optional[str] = ""
    publication_date: Optional[str] = ""
    location: Optional[str] = ""
    read_time: Optional[str] = "5 min read"
    category: str
    cover: str
    excerpt: str
    content: str
    extra_images: Optional[List[str]] = []
    published: Optional[int] = 1

@app.get("/api/admin/stories")
def get_admin_stories(username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM stories ORDER BY publication_date DESC, created_at DESC")
    stories = []
    for st in cursor.fetchall():
        s_dict = dict(st)
        try:
            s_dict["extra_images"] = json.loads(s_dict["extra_images"] or "[]")
        except:
            s_dict["extra_images"] = []
        stories.append(s_dict)
    conn.close()
    return {"stories": stories}

@app.post("/api/admin/stories")
def create_or_update_story(st: StoryModel, username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    story_id = st.id or f"story-{secrets.token_hex(6)}"
    slug = st.slug or story_id

    cursor.execute("SELECT COUNT(*) FROM stories WHERE id = ?", (story_id,))
    exists = cursor.fetchone()[0] > 0
    extra_imgs_json = json.dumps(st.extra_images or [])

    if exists:
        cursor.execute("""
            UPDATE stories
            SET title = ?, slug = ?, author = ?, role = ?, date_text = ?, publication_date = ?, location = ?, read_time = ?, category = ?, cover = ?, excerpt = ?, content = ?, extra_images = ?, published = ?
            WHERE id = ?
        """, (st.title, slug, st.author, st.role, st.date_text, st.publication_date, st.location, st.read_time, st.category, st.cover, st.excerpt, st.content, extra_imgs_json, st.published, story_id))
    else:
        cursor.execute("""
            INSERT INTO stories (id, title, slug, author, role, date_text, publication_date, location, read_time, category, cover, excerpt, content, extra_images, published)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (story_id, st.title, slug, st.author, st.role, st.date_text, st.publication_date, st.location, st.read_time, st.category, st.cover, st.excerpt, st.content, extra_imgs_json, st.published))

    conn.commit()
    conn.close()
    sync_db_to_community_json()
    return {"status": "saved", "id": story_id}

@app.delete("/api/admin/stories/{story_id}")
def delete_story(story_id: str, username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM stories WHERE id = ?", (story_id,))
    conn.commit()
    conn.close()
    sync_db_to_community_json()
    return {"status": "deleted", "id": story_id}

# --- Partners Admin Endpoints ---
class PartnerModel(BaseModel):
    id: Optional[str] = None
    name: str
    category: str
    role: str
    logo: Optional[str] = ""
    text_logo: Optional[str] = ""
    url: Optional[str] = ""
    description: str
    published: Optional[int] = 1
    order_index: Optional[int] = 0

@app.get("/api/admin/partners")
def get_admin_partners(username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM partners ORDER BY order_index ASC, created_at DESC")
    partners = [dict(p) for p in cursor.fetchall()]
    conn.close()
    return {"partners": partners}

@app.post("/api/admin/partners")
def create_or_update_partner(pt: PartnerModel, username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    partner_id = pt.id or f"partner-{secrets.token_hex(6)}"

    cursor.execute("SELECT COUNT(*) FROM partners WHERE id = ?", (partner_id,))
    exists = cursor.fetchone()[0] > 0

    if exists:
        cursor.execute("""
            UPDATE partners
            SET name = ?, category = ?, role = ?, logo = ?, text_logo = ?, url = ?, description = ?, published = ?, order_index = ?
            WHERE id = ?
        """, (pt.name, pt.category, pt.role, pt.logo, pt.text_logo, pt.url, pt.description, pt.published, pt.order_index, partner_id))
    else:
        cursor.execute("""
            INSERT INTO partners (id, name, category, role, logo, text_logo, url, description, published, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (partner_id, pt.name, pt.category, pt.role, pt.logo, pt.text_logo, pt.url, pt.description, pt.published, pt.order_index))

    conn.commit()
    conn.close()
    sync_db_to_community_json()
    return {"status": "saved", "id": partner_id}

@app.delete("/api/admin/partners/{partner_id}")
def delete_partner(partner_id: str, username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM partners WHERE id = ?", (partner_id,))
    conn.commit()
    conn.close()
    sync_db_to_community_json()
    return {"status": "deleted", "id": partner_id}

# --- Opportunities Admin Endpoints ---
class OpportunityModel(BaseModel):
    id: Optional[str] = None
    title: str
    category: str
    type: str
    date_text: str
    deadline: Optional[str] = ""
    location: str
    status: str
    description: str
    action_text: str
    target: Optional[str] = ""
    tag: Optional[str] = ""
    external_link: Optional[str] = ""
    cover_image: Optional[str] = ""
    published: Optional[int] = 1
    order_index: Optional[int] = 0

@app.get("/api/admin/opportunities")
def get_admin_opportunities(username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM opportunities ORDER BY order_index ASC, created_at DESC")
    opportunities = [dict(o) for o in cursor.fetchall()]
    conn.close()
    return {"opportunities": opportunities}

@app.post("/api/admin/opportunities")
def create_or_update_opportunity(opp: OpportunityModel, username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    opp_id = opp.id or f"opp-{secrets.token_hex(6)}"

    cursor.execute("SELECT COUNT(*) FROM opportunities WHERE id = ?", (opp_id,))
    exists = cursor.fetchone()[0] > 0

    if exists:
        cursor.execute("""
            UPDATE opportunities
            SET title = ?, category = ?, type = ?, date_text = ?, deadline = ?, location = ?, status = ?, description = ?, action_text = ?, target = ?, tag = ?, external_link = ?, cover_image = ?, published = ?, order_index = ?
            WHERE id = ?
        """, (opp.title, opp.category, opp.type, opp.date_text, opp.deadline, opp.location, opp.status, opp.description, opp.action_text, opp.target, opp.tag, opp.external_link, opp.cover_image, opp.published, opp.order_index, opp_id))
    else:
        cursor.execute("""
            INSERT INTO opportunities (id, title, category, type, date_text, deadline, location, status, description, action_text, target, tag, external_link, cover_image, published, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (opp_id, opp.title, opp.category, opp.type, opp.date_text, opp.deadline, opp.location, opp.status, opp.description, opp.action_text, opp.target, opp.tag, opp.external_link, opp.cover_image, opp.published, opp.order_index))

    conn.commit()
    conn.close()
    sync_db_to_community_json()
    return {"status": "saved", "id": opp_id}

@app.delete("/api/admin/opportunities/{opp_id}")
def delete_opportunity(opp_id: str, username: str = Depends(verify_token)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM opportunities WHERE id = ?", (opp_id,))
    conn.commit()
    conn.close()
    sync_db_to_community_json()
    return {"status": "deleted", "id": opp_id}

# Serve root index.html and static files
@app.get("/")
def read_root():
    index_path = os.path.join(BASE_DIR, "index.html")
    return FileResponse(index_path, media_type="text/html")

@app.get("/admin")
@app.get("/admin.html")
def read_admin():
    return FileResponse(os.path.join(BASE_DIR, "admin.html"), media_type="text/html")

# Serve community.json from the original data dir on serverless
# (since the /tmp copy is for SQLite seeding only)
@app.get("/data/{filename:path}")
def serve_data_file(filename: str):
    # Try the original bundled data first, then /tmp
    path = os.path.join(BASE_DIR, "data", filename)
    if not os.path.exists(path):
        path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Data file not found")
    media = "application/json" if filename.endswith(".json") else "application/octet-stream"
    return FileResponse(path, media_type=media)

# Catch-all static files handler — serves js/, styles/, assets/ from project root
app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting Founders Community Server on http://0.0.0.0:{port} ...")
    uvicorn.run("server:app", host="0.0.0.0", port=port)
