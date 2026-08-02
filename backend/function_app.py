import azure.functions as func
import logging
import json
import base64
import time
import os
from datetime import datetime, timedelta
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import serialization, hashes

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

@app.route(route="generate-license", methods=["POST"])
def generate_license(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Processing license generation request.")

    # CORS preflight handling (in case backend is hosted on a separate domain)
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    }

    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=headers)

    try:
        req_body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON body"}),
            status_code=400,
            headers=headers
        )

    issued_to = req_body.get("issued_to", "").strip()
    licensed_by = req_body.get("licensed_by", "Aparichit").strip()
    hardware_id = req_body.get("hardware_id", "").strip().upper()
    duration_hours = int(req_body.get("duration_hours", 24))

    # Basic validations
    if not issued_to:
        return func.HttpResponse(
            json.dumps({"error": "Recipient name ('issued_to') is required"}),
            status_code=400,
            headers=headers
        )
    if not hardware_id:
        return func.HttpResponse(
            json.dumps({"error": "Device Code ('hardware_id') is required"}),
            status_code=400,
            headers=headers
        )

    # 1. Fetch Private Key safely from Application Settings
    private_key_pem = os.environ.get("PRIVATE_KEY_PEM")
    if not private_key_pem:
        return func.HttpResponse(
            json.dumps({"error": "Application Error: Private Key is missing from Environment Settings"}),
            status_code=500,
            headers=headers
        )

    try:
        # Replace literal newline escapes if stored as a single-line string in Azure Settings
        normalized_pem = private_key_pem.replace("\\n", "\n")
        private_key = serialization.load_pem_private_key(
            normalized_pem.encode("utf-8"),
            password=None
        )
    except Exception as e:
        logging.error(f"Error loading private key: {str(e)}")
        return func.HttpResponse(
            json.dumps({"error": "Internal Error: Failed to parse signing keys"}),
            status_code=500,
            headers=headers
        )

    # 2. Expiration duration calculation
    now = datetime.now()
    expiry_time = now + timedelta(hours=duration_hours)
    expiry_epoch_ms = int(time.mktime(expiry_time.timetuple()) * 1000)

    # 3. Create Payload
    payload = {
        "issued_to": issued_to,
        "licensed_by": licensed_by,
        "expiry_ms": expiry_epoch_ms,
        "hardware_id": hardware_id
    }

    # 4. Serialize and Base64Url encode
    payload_str = json.dumps(payload, separators=(',', ':'))
    payload_bytes = payload_str.encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode("utf-8").rstrip("=")

    # 5. Sign using RSA-SHA256
    try:
        signature = private_key.sign(
            payload_b64.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        signature_b64 = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
        license_key = f"{payload_b64}.{signature_b64}"
    except Exception as e:
        logging.error(f"Error signing payload: {str(e)}")
        return func.HttpResponse(
            json.dumps({"error": "Signing Error: Failed to sign license payload"}),
            status_code=500,
            headers=headers
        )

    # 6. Response
    response_data = {
        "license_key": license_key,
        "issued_to": issued_to,
        "licensed_by": licensed_by,
        "hardware_id": hardware_id,
        "expiry_time": expiry_time.strftime("%Y-%m-%d %H:%M:%S")
    }

    return func.HttpResponse(
        json.dumps(response_data),
        status_code=200,
        headers=headers
    )
