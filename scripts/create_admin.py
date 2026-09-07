"""
Seed script to create the initial Root Admin user in the database.
Usage:
    python scripts/create_admin.py
    python scripts/create_admin.py --phone 9999999999 --password MyPassword123 --email admin@hospital.com
"""

import argparse
import os
import sys
from sqlalchemy.exc import IntegrityError

# Ensure application packages are discoverable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.database import SessionLocal
from app.models.user import User, UserRole
from app.core.security import get_password_hash


def create_admin(phone: str, password: str, email: str = None) -> bool:
    """Create the initial admin user if one does not already exist with this phone."""
    phone = phone.strip()
    if not phone.isdigit() or not (10 <= len(phone) <= 15):
        print(f"[-] Error: Phone must be 10-15 digits only. Given: '{phone}'")
        return False

    if len(password) < 8 or len(password) > 72:
        print("[-] Error: Password must be between 8 and 72 characters long.")
        return False

    db = SessionLocal()
    try:
        existing_user = db.query(User).filter(User.phone == phone).first()
        if existing_user:
            if existing_user.role == UserRole.ADMIN:
                print(f"[*] Admin with phone '{phone}' already exists (ID: {existing_user.id}). No action needed.")
                return True
            else:
                print(f"[-] Error: A user with phone '{phone}' already exists with role '{existing_user.role.value}'.")
                return False

        admin = User(
            phone=phone,
            email=email.strip() if email else None,
            password_hash=get_password_hash(password),
            role=UserRole.ADMIN,
            is_active=True,
            provider_id=None,
        )

        db.add(admin)
        db.commit()
        db.refresh(admin)

        print("=" * 60)
        print("[+] Root Admin Created Successfully!")
        print(f"   ID:       {admin.id}")
        print(f"   Phone:    {admin.phone}")
        print(f"   Email:    {admin.email or '(None)'}")
        print(f"   Role:     {admin.role.value}")
        print(f"   Active:   {admin.is_active}")
        print("=" * 60)
        print("You can now login at POST /api/v1/users/login and use the token in Swagger.")
        return True

    except IntegrityError as e:
        db.rollback()
        print(f"[-] Database error creating admin: {e}")
        return False
    finally:
        db.close()


def main():
    default_phone = os.getenv("FIRST_SUPERUSER_PHONE", "9999999999")
    default_password = os.getenv("FIRST_SUPERUSER_PASSWORD", "AdminPass123")
    default_email = os.getenv("FIRST_SUPERUSER_EMAIL", "admin@hospital.com")

    parser = argparse.ArgumentParser(description="Create initial Admin user for Patient Management System")
    parser.add_argument(
        "--phone",
        type=str,
        default=default_phone,
        help=f"Admin login phone number (default: {default_phone})"
    )
    parser.add_argument(
        "--password",
        type=str,
        default=default_password,
        help="Admin password (min 8 chars, max 72 chars)"
    )
    parser.add_argument(
        "--email",
        type=str,
        default=default_email,
        help=f"Admin email address (default: {default_email})"
    )

    args = parser.parse_args()
    success = create_admin(phone=args.phone, password=args.password, email=args.email)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
