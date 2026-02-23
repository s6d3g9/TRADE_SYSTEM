from __future__ import annotations

import anyio
import smtplib
from email.message import EmailMessage

from app.core.config import settings


def send_email(*, to_email: str, subject: str, body_text: str) -> None:
    """Send email via SMTP if configured.

    If SMTP is not configured, the email is printed to logs (stdout) so dev can copy the link.
    """

    if not settings.smtp_host or not settings.smtp_from:
        print("[EMAIL][DEV] to=", to_email)
        print("[EMAIL][DEV] subject=", subject)
        print("[EMAIL][DEV] body=\n", body_text)
        return

    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body_text)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_user and settings.smtp_password:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


async def send_email_async(*, to_email: str, subject: str, body_text: str) -> None:
    # SMTP via smtplib is blocking, so always run it in a worker thread.
    await anyio.to_thread.run_sync(
        send_email,
        to_email=to_email,
        subject=subject,
        body_text=body_text,
    )
