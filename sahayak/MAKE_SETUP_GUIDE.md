# Make.com Fallback Setup — Sahayak AI
## Use this if VAPI outbound calls are not working

When to use this: If you don't have VAPI_PRIVATE_KEY or a VAPI phone number,
Make.com + Twilio can send real calls/WhatsApp messages to patients.

---

## Option A: WhatsApp Message (Easiest — 10 min)

1. Go to make.com → Sign up free
2. New Scenario → "+" → Webhooks → Custom Webhook → Copy URL
3. Add second module: "WhatsApp Business" (or use Twilio)
4. Connect your WhatsApp Business account
5. Map fields: phone = {{1.phone}}, message = {{1.message}}
6. Paste the webhook URL in .env:
   MAKE_WEBHOOK_URL=https://hook.eu2.make.com/YOUR_ID

When ASHA clicks "Call Now" in the portal:
→ Sahayak backend calls Make.com webhook
→ Make.com sends WhatsApp message to patient
→ Patient replies → ASHA sees it

---

## Option B: Real Phone Call via Twilio (15 min)

1. twilio.com → Sign up → Get a trial phone number
   (Indian virtual numbers: +91 available, ~$1/month)
2. make.com → New Scenario → Webhook → Twilio "Make a Call"
3. Twilio "Make a Call" module:
   - Account SID: from twilio.com/console
   - Auth Token: from twilio.com/console
   - From: your Twilio number
   - To: {{1.phone}}
   - TwiML: <Response><Say language="kn-IN">{{1.message}}</Say></Response>
4. Paste webhook URL in .env: MAKE_WEBHOOK_URL=https://hook.eu2.make.com/YOUR_ID

---

## Option C: VAPI Proper Setup (Best quality — 20 min)

1. vapi.ai → Sign up → Dashboard → API Keys
   - Copy Private Key → VAPI_PRIVATE_KEY in .env
2. Dashboard → Phone Numbers → Buy Number
   - Select India (+91) OR US number with forwarding
   - Copy Phone Number ID → VAPI_PHONE_NUMBER_ID_ASHA in .env
3. Dashboard → Settings → Add webhook URL:
   https://your-domain.com/vapi/tool-call
4. Restart server: uvicorn main:app --reload --port 8000
5. Test: ASHA Portal → pick a patient with phone → Call Now

VAPI gives real AI voice conversations in Kannada/Hindi.
The patient hears an AI voice and can respond naturally.

---

## How the fallback works in code

routes/vapi_routes.py  POST /vapi/call-patient:
1. Check VAPI_PRIVATE_KEY → if set, call VAPI REST API
2. Check MAKE_WEBHOOK_URL → if set, call Make.com webhook
3. If neither → return demo_mode: true (shows message in UI)

The frontend (asha_portal.html) handles all three cases:
- VAPI success: green "Calling patient..." message
- Make.com success: green "Call triggered via Make.com"
- Demo mode: yellow "Add VAPI key for real calls"
