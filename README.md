# 🏥 Patient Management System API

A FastAPI-based REST API for managing patient records with PostgreSQL, SQLAlchemy ORM, and Alembic migrations. 
Status : 🚧[In development]

---

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [API Endpoints](#api-endpoints)
- [Testing](#testing)
- [Development Workflow](#development-workflow)

---

## 🚀 Features

-  **Create Patient** - Register new patients with unique patient numbers `[Done]`
-  **Get Patient** - Retrieve patient details by patient number `[Done]`
-  **Get All Patients** - List all active patients with pagination `[Done]`
-  **Update Patient** - Partially update patient information `[Done]`
-  **Soft Delete** - Deactivate patients (set `is_active = False`) `[Done]`
-  **Reactivate** - Reactivate previously deactivated patients `[Done]`
-  **Search** - Search patients by name, phone, or patient number `[Done]`
-  **Pagination** - Page through patient lists `[Done]`
-  **Soft Delete** - No data is permanently deleted `[Done]`
-  **PostgreSQL** - Production-ready database `[Done]`
-  **Transaction Management** - Proper error handling and rollbacks `[Done]`

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **FastAPI** | Web framework |
| **SQLAlchemy** | ORM |
| **PostgreSQL** | Database |
| **Alembic** | Migrations |
| **Pydantic** | Data validation |
| **python-dotenv** | Environment variables |

---

## 📁 Project Structure

```
patient-management-system/
├── app/
│   ├── api/
│   │   └── routes/
│   │       └── patients.py      # API endpoints
│   ├── core/
│   │   ├── config.py            # Settings
│   │   └── database.py          # DB connection
│   ├── db/
│   │   └── database.py          # Base & Session
│   ├── models/
│   │   └── patient.py           # SQLAlchemy model
│   ├── schemas/
│   │   └── patient.py           # Pydantic schemas
│   ├── services/
│   │   └── patient.py           # Business logic
│   └── main.py                  # FastAPI app
├── alembic/
│   ├── versions/                # Migration files
│   └── env.py                   # Alembic config
├── tests/                       # Test files (ignored in git)
├── .env                         # Environment variables
├── .gitignore
├── alembic.ini
├── requirements.txt
└── README.md
```

---

## ⚙️ Setup & Installation

### 1. **Clone the Repository**
```bash
git clone <repo-url>
cd patient-management-system
```

### 2. **Create Virtual Environment**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. **Install Dependencies**
```bash
pip install -r requirements.txt
```

### 4. **Set Up PostgreSQL**
```bash
# Create databases
createdb -U postgres patient_management
createdb -U postgres test_db
```

### 5. **Environment Variables**
Create `.env` file:
```env
DATABASE_URL=postgresql+psycopg://postgres:your_password@localhost:5432/patient_management
TEST_DATABASE_URL=postgresql+psycopg://postgres:your_password@localhost:5432/test_db
```

### 6. **Run Migrations**
```bash
# For development
alembic upgrade head

# For test (if needed)
export ALEMBIC_ENV=test
alembic upgrade head
```

### 7. **Start Server**
```bash
uvicorn app.main:app --reload
```

### 8. **Access API Docs**
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## 🔧 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Development database URL | `postgresql+psycopg://postgres:pass@localhost:5432/patient_management` |
| `TEST_DATABASE_URL` | Test database URL | `postgresql+psycopg://postgres:pass@localhost:5432/test_db` |

---

## 🗄️ Database Migrations

### **Dev Database**
```bash
# Generate migration
alembic revision --autogenerate -m "description"

# Apply migration
alembic upgrade head

# Check current version
alembic current
```

### **Test Database**
```bash
export ALEMBIC_ENV=test
alembic upgrade head
```

### **Reset Database**
```bash
# Drop and recreate
psql -U postgres -d patient_management -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
alembic upgrade head
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/patients` | Create a new patient |
| `GET` | `/api/v1/patients` | Get all patients (with pagination & search) |
| `GET` | `/api/v1/patients/{patient_number}` | Get patient by patient number |
| `PATCH` | `/api/v1/patients/{patient_number}` | Update patient |
| `DELETE` | `/api/v1/patients/{patient_number}` | Soft delete patient |
| `PATCH` | `/api/v1/patients/{patient_number}/reactivate` | Reactivate patient |

### **Query Parameters**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | `1` | Page number |
| `limit` | `10` | Items per page (max 100) |
| `search` | `None` | Search by name, phone, or patient_number |

---

## 📝 Example Requests

### **Create Patient**
```http
POST /api/v1/patients
{
  "name": "John Doe",
  "phone": "9876543210",
  "dob": "1990-01-15",
  "gender": "Male",
  "address": "123 Main Street",
  "chief_complaint": "Fever and cough",
  "aadhaar": "123456789012"
}
```

### **Response**
```json
{
  "patient_number": "PDC-000001",
  "name": "John Doe",
  "phone": "9876543210",
  "dob": "1990-01-15",
  "gender": "Male",
  "address": "123 Main Street",
  "chief_complaint": "Fever and cough"
}
```

### **Search Patients**
```http
GET /api/v1/patients?search=John&page=1&limit=10
```

### **Update Patient**
```http
PATCH /api/v1/patients/PDC-000001
{
  "phone": "9998887777",
  "address": "456 New Street"
}
```

### **Soft Delete**
```http
DELETE /api/v1/patients/PDC-000001
```

### **Reactivate**
```http
PATCH /api/v1/patients/PDC-000001/reactivate
```

---

## 🧪 Testing

```bash
# Run all tests
pytest tests/ -v

# Run specific test
pytest tests/test_patients.py::test_create_patient_success -v
```

---

## 🔄 Development Workflow

```bash
# 1. Start PostgreSQL
sudo systemctl start postgresql  # Linux
brew services start postgresql   # Mac

# 2. Activate environment
source venv/bin/activate

# 3. Run migrations
alembic upgrade head

# 4. Start dev server
uvicorn app.main:app --reload

# 5. Test endpoints at http://localhost:8000/docs
```

---

## 🐘 Database Schema

### **Patients Table**
| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key (auto-increment) |
| `patient_number` | String(20) | Unique public ID (e.g., PDC-000001) |
| `name` | String(200) | Patient's full name |
| `phone` | String(20) | Contact number |
| `dob` | Date | Date of birth |
| `aadhaar` | String(20) | Unique government ID (optional) |
| `gender` | String(10) | Gender |
| `address` | String(300) | Address |
| `chief_complaint` | String(300) | Main complaint |
| `is_active` | Boolean | Soft delete flag (default: true) |

---

## 🛡️ Error Handling

| Status Code | Description |
|-------------|-------------|
| `201` | Created successfully |
| `200` | Success |
| `400` | Bad request (validation error) |
| `404` | Patient not found |
| `500` | Internal server error |

---

## 🔐 Security Notes

- `patient_number` is the public identifier (not `id`)
- `is_active` flag enables soft delete (no data loss)
- Database credentials stored in `.env` (never commit)
- Input validation via Pydantic schemas

---

## 📦 Requirements

Create `requirements.txt`:
```txt
use to  pip list
```

---

## 🤝 Contributing
1. Fork the repo. 
2. Create a feature branch.
3. Commit your changes.
4. Push to the branch.
5. Open a Pull Request.

---

## 📄 License

This project is for educational purposes.

---

## ✨ Acknowledgments

- FastAPI for the amazing framework
- SQLAlchemy for the powerful ORM
- PostgreSQL for the reliable database

---

**Happy Coding!** 🚀

---

## Quick Commands Reference
```bash
# Dev
uvicorn app.main:app --reload

# Migrations
alembic upgrade head
alembic revision --autogenerate -m "msg"

# Test
export ALEMBIC_ENV=test
alembic upgrade head
pytest tests/ -v

# Database
psql -U postgres -d patient_management -c "\dt"
```
