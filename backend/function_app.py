import azure.functions as func
import logging
import json
import base64
import time
import os
import random
import hashlib
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import serialization, hashes

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

def send_otp_email(otp: str):
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "465"))
    smtp_user = os.environ.get("SMTP_USER", "shudarsanregmi555@gmail.com")
    smtp_password = os.environ.get("SMTP_PASSWORD", "hdbb uclw fotl mkia")
    sender_email = os.environ.get("SENDER_EMAIL", "shudarsanregmi555@gmail.com")
    
    msg = MIMEMultipart()
    msg['From'] = f"DivyaLekhani Admin <{sender_email}>"
    msg['To'] = sender_email
    msg['Subject'] = f"DivyaLekhani Access OTP: {otp}"
    
    body = f"""
    <html>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0b0d19; color: #ffffff; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #16192b; border: 1px solid rgba(255,255,255,0.08); border-radius: 15px; padding: 35px; text-align: center; box-shadow: 0 15px 30px rgba(0,0,0,0.5);">
            <h2 style="color: #00e5ff; margin-bottom: 10px; font-weight: 700;">Admin Verification Required</h2>
            <p style="color: #abb1cc; font-size: 15px; margin-bottom: 25px;">Enter the following One-Time Password to unlock the license generator interface:</p>
            <div style="font-size: 36px; font-weight: 800; color: #39ff14; letter-spacing: 6px; background: rgba(57,255,20,0.08); padding: 15px 30px; border-radius: 10px; display: inline-block; margin-bottom: 25px; border: 1px solid rgba(57,255,20,0.2);">
                {otp}
            </div>
            <p style="color: #555977; font-size: 12px; margin-top: 10px;">This OTP is valid for 5 minutes.</p>
        </div>
    </body>
    </html>
    """
    msg.attach(MIMEText(body, 'html'))
    
    with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
        server.login(smtp_user, smtp_password)
        server.sendmail(sender_email, sender_email, msg.as_string())

@app.route(route="generate-license", methods=["POST"])
def generate_license(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Processing API request.")

    # CORS headers
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

    # 0. Check for Server Time Challenge Request (Mitigates Clock Drift & Hides Raw Password values)
    action = req_body.get("action", "").strip()
    if action == "get_challenge":
        return func.HttpResponse(
            json.dumps({"server_time": int(time.time())}),
            status_code=200,
            headers=headers
        )

    # Fetch Private Key securely
    private_key_pem = os.environ.get("PRIVATE_KEY_PEM")
    if not private_key_pem:
        return func.HttpResponse(
            json.dumps({"error": "Server Configuration Error: Sign key missing"}),
            status_code=500,
            headers=headers
        )

    try:
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

    # Determine step based on payload fields
    auth_token = req_body.get("auth_token", "").strip()
    otp = req_body.get("otp", "").strip()
    session_token = req_body.get("session_token", "").strip()
    password = req_body.get("password", "").strip()
    timestamp_str = req_body.get("timestamp", "").strip()

    if auth_token:
        # =====================================================================
        # PHASE 3: AUTHORIZED GENERATION OF LICENSE
        # =====================================================================
        token_parts = auth_token.split(".")
        if len(token_parts) != 2:
            return func.HttpResponse(
                json.dumps({"error": "Malformed authorization token"}),
                status_code=401,
                headers=headers
            )

        payload_b64, signature_b64 = token_parts[0], token_parts[1]

        # Verify Signature
        try:
            sig_bytes = base64.urlsafe_b64decode(signature_b64 + "=" * (4 - len(signature_b64) % 4))
            public_key = private_key.public_key()
            public_key.verify(
                sig_bytes,
                payload_b64.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256()
            )
        except Exception as e:
            return func.HttpResponse(
                json.dumps({"error": "Invalid authorization token signature"}),
                status_code=401,
                headers=headers
            )

        # Parse Payload
        try:
            payload_bytes = base64.urlsafe_b64decode(payload_b64 + "=" * (4 - len(payload_b64) % 4))
            auth_data = json.loads(payload_bytes.decode("utf-8"))
        except Exception as e:
            return func.HttpResponse(
                json.dumps({"error": "Failed to parse authorization metadata"}),
                status_code=400,
                headers=headers
            )

        # Verify Expiry
        expiry = auth_data.get("expiry", 0)
        if int(time.time()) > expiry:
            return func.HttpResponse(
                json.dumps({"error": "Authorization expired. Please re-authenticate."}),
                status_code=401,
                headers=headers
            )

        # Extract License details from body
        issued_to = req_body.get("issued_to", "").strip()
        licensed_by = req_body.get("licensed_by", "Aparichit").strip()
        hardware_id = req_body.get("hardware_id", "").strip().upper()
        duration_hours = int(req_body.get("duration_hours", 24))

        if not issued_to or not hardware_id:
            return func.HttpResponse(
                json.dumps({"error": "issued_to and hardware_id are required fields"}),
                status_code=400,
                headers=headers
            )

        # Generate License payload
        now = datetime.now()
        expiry_time = now + timedelta(hours=duration_hours)
        expiry_epoch_ms = int(time.mktime(expiry_time.timetuple()) * 1000)

        license_payload = {
            "issued_to": issued_to,
            "licensed_by": licensed_by,
            "expiry_ms": expiry_epoch_ms,
            "hardware_id": hardware_id
        }

        # Sign License
        try:
            license_str = json.dumps(license_payload, separators=(',', ':'))
            lic_b64 = base64.urlsafe_b64encode(license_str.encode("utf-8")).decode("utf-8").rstrip("=")
            lic_sig = private_key.sign(
                lic_b64.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256()
            )
            lic_sig_b64 = base64.urlsafe_b64encode(lic_sig).decode("utf-8").rstrip("=")
            license_key = f"{lic_b64}.{lic_sig_b64}"
        except Exception as e:
            return func.HttpResponse(
                json.dumps({"error": f"Failed to sign license: {str(e)}"}),
                status_code=500,
                headers=headers
            )

        return func.HttpResponse(
            json.dumps({
                "license_key": license_key,
                "issued_to": issued_to,
                "licensed_by": licensed_by,
                "hardware_id": hardware_id,
                "expiry_time": expiry_time.strftime("%Y-%m-%d %H:%M:%S")
            }),
            status_code=200,
            headers=headers
        )

    elif otp and session_token:
        # =====================================================================
        # PHASE 2: VERIFY OTP AND RETURN TEMPORARY AUTHORIZATION TOKEN (30 MIN)
        # =====================================================================
        token_parts = session_token.split(".")
        if len(token_parts) != 2:
            return func.HttpResponse(
                json.dumps({"error": "Invalid session token format"}),
                status_code=400,
                headers=headers
            )

        payload_b64, signature_b64 = token_parts[0], token_parts[1]

        # Verify Signature
        try:
            sig_bytes = base64.urlsafe_b64decode(signature_b64 + "=" * (4 - len(signature_b64) % 4))
            public_key = private_key.public_key()
            public_key.verify(
                sig_bytes,
                payload_b64.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256()
            )
        except Exception as e:
            return func.HttpResponse(
                json.dumps({"error": "Session verification failed"}),
                status_code=401,
                headers=headers
            )

        # Parse session details
        try:
            payload_bytes = base64.urlsafe_b64decode(payload_b64 + "=" * (4 - len(payload_b64) % 4))
            session_data = json.loads(payload_bytes.decode("utf-8"))
        except Exception as e:
            return func.HttpResponse(
                json.dumps({"error": "Failed to parse session metadata"}),
                status_code=400,
                headers=headers
            )

        # Check Expiry
        expiry = session_data.get("expiry", 0)
        if int(time.time()) > expiry:
            return func.HttpResponse(
                json.dumps({"error": "Session expired. Please request a new OTP."}),
                status_code=401,
                headers=headers
            )

        # Validate OTP
        otp_hash = session_data.get("otp_hash", "")
        input_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()
        if input_hash != otp_hash:
            return func.HttpResponse(
                json.dumps({"error": "Invalid OTP. Please check your email and try again."}),
                status_code=401,
                headers=headers
            )

        # OTP is valid! Generate an auth_token valid for 30 minutes
        auth_data = {
            "authorized": True,
            "expiry": int(time.time()) + 1800 # 30 minutes session duration
        }

        try:
            auth_str = json.dumps(auth_data, separators=(',', ':'))
            auth_b64 = base64.urlsafe_b64encode(auth_str.encode("utf-8")).decode("utf-8").rstrip("=")
            auth_sig = private_key.sign(
                auth_b64.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256()
            )
            auth_sig_b64 = base64.urlsafe_b64encode(auth_sig).decode("utf-8").rstrip("=")
            auth_token = f"{auth_b64}.{auth_sig_b64}"
        except Exception as e:
            return func.HttpResponse(
                json.dumps({"error": f"Failed to generate authorization session: {str(e)}"}),
                status_code=500,
                headers=headers
            )

        return func.HttpResponse(
            json.dumps({
                "authorized": True,
                "auth_token": auth_token
            }),
            status_code=200,
            headers=headers
        )

    elif password and timestamp_str:
        # =====================================================================
        # PHASE 1: PASSWORD (SHA256 HASH) VERIFICATION AND DISPATCH OTP
        # =====================================================================
        try:
            input_ts = int(timestamp_str)
        except ValueError:
            return func.HttpResponse(
                json.dumps({"error": "Invalid timestamp layout"}),
                status_code=401,
                headers=headers
            )

        # Verify time-window (expanded to 30s to accommodate time fetch + client hashing delay)
        server_now = int(time.time())
        diff = server_now - input_ts
        if diff < 0 or diff > 30:
            return func.HttpResponse(
                json.dumps({"error": "Authentication request expired (time window exceeded 30s)"}),
                status_code=401,
                headers=headers
            )

        # Verify password hash match using the secret salt
        salt = os.environ.get("AUTH_SALT", "DivyaLekhaniSecretSalt123!")
        expected_hash = hashlib.sha256(f"{input_ts}{salt}".encode('utf-8')).hexdigest()

        if password != expected_hash:
            return func.HttpResponse(
                json.dumps({"error": "Authorization credentials invalid"}),
                status_code=401,
                headers=headers
            )

        # Generate 6-digit OTP
        otp_code = f"{random.randint(100000, 999999)}"

        # Dispatch OTP
        try:
            send_otp_email(otp_code)
        except Exception as e:
            logging.error(f"Failed to send email: {str(e)}")
            return func.HttpResponse(
                json.dumps({"error": "Communication failure: Could not dispatch verification OTP"}),
                status_code=500,
                headers=headers
            )

        # Build session token
        session_data = {
            "otp_hash": hashlib.sha256(otp_code.encode("utf-8")).hexdigest(),
            "expiry": int(time.time()) + 300 # Valid for 5 minutes
        }

        try:
            session_str = json.dumps(session_data, separators=(',', ':'))
            session_b64 = base64.urlsafe_b64encode(session_str.encode("utf-8")).decode("utf-8").rstrip("=")
            session_sig = private_key.sign(
                session_b64.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256()
            )
            session_sig_b64 = base64.urlsafe_b64encode(session_sig).decode("utf-8").rstrip("=")
            session_token = f"{session_b64}.{session_sig_b64}"
        except Exception as e:
            return func.HttpResponse(
                json.dumps({"error": f"Failed to build secure session token: {str(e)}"}),
                status_code=500,
                headers=headers
            )

        return func.HttpResponse(
            json.dumps({
                "otp_required": True,
                "session_token": session_token
            }),
            status_code=200,
            headers=headers
        )

    else:
        return func.HttpResponse(
            json.dumps({"error": "Bad Request: Missing authentication details"}),
            status_code=400,
            headers=headers
        )
