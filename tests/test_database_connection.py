from sqlalchemy import text
from app.db.database import engine

def test_connection():
    
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            value = result.scalar()
            
            print("✅ Database connection successful!")
            print(f"✅ Query returned: {value}")
            return True
            
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

if __name__ == "__main__":
    test_connection()