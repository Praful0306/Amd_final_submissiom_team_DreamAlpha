from mangum import Mangum
from main import app

# Mangum wrapper converts AWS Lambda events into ASGI scope/events for FastAPI
handler = Mangum(app)
