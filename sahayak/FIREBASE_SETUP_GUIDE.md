# 🔥 Firebase Auth Setup — Sahayak AI

## Step 1: Create Firebase Project (5 minutes)

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"**
3. Name: `sahayak-ai` → Continue
4. Disable Google Analytics (not needed) → **Create project**

---

## Step 2: Enable Email/Password + Google Auth

1. Firebase Console → **Authentication** (left sidebar)
2. Click **"Get started"**
3. **Sign-in method** tab → Enable **Email/Password** → Save
4. **Sign-in method** tab → Enable **Google** → set support email → Save

---

## Step 3: Get Your Web App Config (for Frontend)

1. Firebase Console → ⚙️ Project Settings (gear icon, top-left)
2. Scroll to **"Your apps"** → Click **</>** (Web app)
3. App nickname: `sahayak-web` → Register
4. You'll see a `firebaseConfig` object like:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyB...",
  authDomain: "sahayak-ai.firebaseapp.com",
  projectId: "sahayak-ai",
  storageBucket: "sahayak-ai.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

5. Convert to JSON string and add to `.env`:
```env
FIREBASE_WEB_CONFIG={"apiKey":"AIzaSyB...","authDomain":"sahayak-ai.firebaseapp.com","projectId":"sahayak-ai","storageBucket":"sahayak-ai.appspot.com","messagingSenderId":"123456789","appId":"1:123456789:web:abc..."}
```

---

## Step 4: Get Service Account Key (for Backend)

1. Firebase Console → ⚙️ Project Settings → **Service accounts** tab
2. Click **"Generate new private key"** → Download JSON
3. Rename it to `firebase-service-account.json`
4. Place it in your project root folder (same level as `main.py`)
5. Add to `.env`:
```env
FIREBASE_SERVICE_ACCOUNT_PATH=firebase-service-account.json
```

> **For cloud deployment** (Render/Railway/Heroku): paste the entire JSON as one line in `.env`:
> ```env
> FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"sahayak-ai",...}
> ```

---

## Step 5: Install firebase-admin

```bash
pip install firebase-admin>=6.4.0
```
(Already added to `requirements.txt`)

---

## Step 6: Run Database Migration

```bash
python migrate_db.py
```
This adds `firebase_uid`, `asha_worker_id`, and other isolation columns to your DB.

---

## Step 7: Test

```bash
uvicorn main:app --reload --port 8000
```

Open http://localhost:8000/auth.html

- Click "Create Account" → set role → sign up
- You should be redirected to your role's portal
- Each user now sees ONLY their own data

---

## How Data Isolation Works

```
User A (Patient)  registers → firebase_uid = "abc123"
User A submits report → medical_reports.firebase_uid = "abc123"
User A runs diagnosis → diagnosis_log.firebase_uid = "abc123"
User A calls /analytics/stats?uid=abc123 → returns COUNT WHERE firebase_uid = "abc123"

User B (Patient) registers → firebase_uid = "xyz789"
User B calls /analytics/stats?uid=xyz789 → returns COUNT WHERE firebase_uid = "xyz789"
User B CANNOT see User A's reports ✅

ASHA Worker (Nithya) registers → firebase_uid = "nithya123"
Nithya registers a patient → patients.asha_firebase_uid = "nithya123"
Nithya calls /deep_impact?uid=nithya123 → returns only HER patients ✅

ASHA Worker (Priya) registers → firebase_uid = "priya456"
Priya calls /deep_impact?uid=priya456 → returns only HER patients ✅
Priya CANNOT see Nithya's patients ✅
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| "Firebase config not available" | Set FIREBASE_WEB_CONFIG in .env |
| "Invalid Firebase token" | Check service account JSON path/content |
| "firebase-admin not installed" | Run: pip install firebase-admin |
| Google sign-in popup blocked | Allow popups for localhost in browser |
| "auth/unauthorized-domain" | Add your domain in Firebase Console → Authentication → Settings → Authorized domains |

---

## Authorized Domains (for Production)

Firebase blocks sign-in from unknown domains.
Add your production domain at:
Firebase Console → Authentication → Settings → **Authorized domains** → Add domain

Default allowed: `localhost` (for development)
