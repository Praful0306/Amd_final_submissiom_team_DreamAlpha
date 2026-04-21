# 🎙️ Sahayak AI — VAPI Voice Agent Setup Guide

## What VAPI Does in Sahayak

Sahayak has **3 personalised voice agents**, one for each portal:

| Portal | Agent Name | Language | What It Knows |
|--------|-----------|----------|---------------|
| Patient | Health Assistant | Kannada / Hindi / English | Your medicines, vitals, reports, risk level |
| Doctor | Clinical Assistant | English | Your full patient list, high-risk cases, ICMR protocols |
| ASHA | ASHA Field Agent | Kannada-first | Today's priority visits, outbreak data, community stats |

Each agent fetches **live data from the SQLite database** before the first message, so it always knows your real current information.

---

## Step 1: Create Your VAPI Account (Free)

1. Go to **https://vapi.ai** → Sign Up (free tier is enough)
2. Dashboard → **API Keys** → **+ Create Key**
3. Choose **Public Key** — copy it (starts with `vapi_pub_...`)
4. Keep the dashboard open — you'll need it

---

## Step 2: Add Your Key to Sahayak

### For ASHA Workers (asha_portal.html)
1. Open ASHA Portal → Sidebar → **Settings → VAPI Settings**
2. Paste your **VAPI Public Key**
3. Fill in **Your Name** (e.g. "Nithya") and **District** (e.g. "Hubballi")
4. Select **Language** → Kannada
5. Click **Save Settings**
6. Click **Test Connection** — you should see ✅ green

> **No Assistant ID needed** — Sahayak creates the agent automatically using live DB data.

### For Patients (patient.html)
1. Patient Portal → Sidebar → **Voice Settings**
2. Paste your **VAPI Public Key**
3. Click **Save & Test**

### For Doctors (doctor.html)
1. Doctor Portal → Sidebar → **Voice Settings**
2. Paste your **VAPI Public Key**  
3. Click **Save & Test**

---

## Step 3: Set Backend Public URL (Critical for Production)

VAPI agents call your backend to fetch live data. You must set:

```env
# In your .env file
BACKEND_PUBLIC_URL=https://your-actual-domain.com
```

For local testing: `http://localhost:8000` (default)  
For production: Use your actual domain or ngrok URL

**Without this**, the agent can answer basic questions but cannot fetch real patient data.

---

## Step 4: Supabase Government Sync (Optional)

For government reporting and multi-device ASHA data sync:

1. Go to **https://supabase.com** → New Project (free tier)
2. Settings → API → Copy **Project URL** and **Service Role Key**
3. ASHA Portal → Settings → Supabase → paste both → **Test + Sync**

In `.env`:
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJhbGc...your-service-role-key
```

---

## How the Voice Agents Work

### Patient Agent Flow
```
User clicks "Voice Call" → 
  Backend fetches patient vitals, meds, risk from SQLite →
  VAPI starts call with personalised system prompt →
  Agent knows: "Praya has Hb 8.4 (Severe Anaemia), takes Iron 200mg BD..."
  Agent answers: "Aapko Iron ki goli subah aur shaam khane ke saath leni hai..."
```

### ASHA Agent Flow  
```
ASHA clicks call button →
  Backend runs agent_service.run_proactive_agent() →
  Returns: today's high-risk patients, outbreak status, area priorities →
  Agent starts in Kannada: "ಶುಭೋದಯ Nithya! ಇಂದು ಮೊದಲು Lakshmi Devi..."
  ASHA asks: "ನಿನ್ನೆ ಎಲ್ಲಿ ಬಾಕಿ ಇದೆ?" →
  Agent fetches from DB and responds with actual pending visits
```

### Doctor Agent Flow
```
Doctor starts call →
  Backend fetches doctor's patient list with risk levels →
  Agent knows: "Dr. Priya has 8 patients, 2 HIGH risk: Lakshmi (Anaemia), Ravi (Malaria)" →
  Doctor asks: "Who needs urgent attention?" →
  Agent: "Lakshmi Devi is EMERGENCY — Hb 6.2, refer immediately per ICMR..."
```

---

## What Users Can Ask

### Patients
- "When should I take my medicine?" / "ಔಷಧಿ ಯಾವಾಗ ತೆಗೆದುಕೊಳ್ಳಬೇಕು?"
- "My haemoglobin is 8.4 — is that serious?"
- "What foods should I avoid with my tablets?"
- "Should I go to the hospital today?"
- "Explain my blood test results"

### ASHA Workers (in Kannada)
- "ಇಂದು ಯಾರನ್ನು ಮೊದಲು ನೋಡಬೇಕು?" (Who to visit first today?)
- "ಯಾವ ಗ್ರಾಮದಲ್ಲಿ ರೋಗ ಹರಡುತ್ತಿದೆ?" (Which village has outbreak?)
- "ನಿನ್ನೆ ಏನು ಬಾಕಿ ಉಳಿದಿದೆ?" (What's pending from yesterday?)
- "ANC ಭೇಟಿ ಬಾಕಿ ಇರುವ ತಾಯಂದಿರು ಯಾರು?" (Which mothers need ANC?)
- "ಮಲೇರಿಯಾ ಚಿಕಿತ್ಸೆ ಏನು?" (What is malaria treatment?)

### Doctors
- "Who are my high-risk patients today?"
- "What is the ICMR protocol for dengue Group C?"
- "What is the correct Artemether dose for a 20kg child?"
- "Referral criteria for pneumonia — when to send to district hospital?"
- "Drug interactions for Metformin + Amlodipine?"

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "No VAPI key set" | Key not saved | Go to Settings → VAPI → Save |
| Agent answers generically | BACKEND_PUBLIC_URL wrong | Set correct URL in .env |
| Call doesn't start | VAPI SDK not loading | Check internet connection |
| Agent speaks English not Kannada | Language setting wrong | Settings → Language → Kannada |
| "Tool error" in VAPI | Backend not reachable from VAPI | Use public URL (ngrok for dev) |

---

## Production Deployment Checklist

- [ ] `BACKEND_PUBLIC_URL` set to public HTTPS URL
- [ ] VAPI public key saved in each portal's settings
- [ ] Language set to Kannada for ASHA portal
- [ ] ASHA name and district filled in settings
- [ ] `python migrate_db.py` run once
- [ ] `.env` has valid `GROQ_API_KEY_1` (or AWS Bedrock keys)
- [ ] Supabase configured (optional, for multi-device sync)
- [ ] Service worker registered (test: chrome://serviceworker-internals)

---

## Offline Mode

**ASHA workers in areas without network:**
- All patient data collection works offline
- Data saves to local SQLite on the device
- When ASHA moves to a networked area, **auto-sync triggers** and uploads to Supabase
- The sync indicator in the portal shows: 🟡 Offline → 🟢 Synced

**Voice calls require internet** — VAPI is cloud-based. Offline voice uses the device's built-in speech synthesis.
