#!/usr/bin/env python3
"""
Database connection test script for PostgreSQL data warehouse.
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv

def test_database_connection():
    """Test connection to PostgreSQL database."""
    
    # Load environment variables
    load_dotenv()
    
    # Database connection parameters
    db_params = {
        'host': os.getenv('DB_HOST'),
        'port': os.getenv('DB_PORT'),
        'database': os.getenv('DB_DATABASE'),
        'user': os.getenv('DB_USERNAME'),
        'password': os.getenv('DB_PASSWORD'),
        'sslmode': os.getenv('DB_SSLMODE', 'require'),
        'sslrootcert': 'ca-certificate.crt'
    }
    
    print("Testing database connection...")
    print(f"Host: {db_params['host']}")
    print(f"Port: {db_params['port']}")
    print(f"Database: {db_params['database']}")
    print(f"User: {db_params['user']}")
    print(f"SSL Mode: {db_params['sslmode']}")
    print("-" * 50)
    
    try:
        # Establish connection
        conn = psycopg2.connect(**db_params)
        cursor = conn.cursor()
        
        # Test basic query
        cursor.execute("SELECT version();")
        version = cursor.fetchone()
        print(f"✅ Connection successful!")
        print(f"PostgreSQL version: {version[0]}")
        
        # Test current database info
        cursor.execute("SELECT current_database(), current_user;")
        db_info = cursor.fetchone()
        print(f"Current database: {db_info[0]}")
        print(f"Current user: {db_info[1]}")
        
        # List tables
        cursor.execute("""
            SELECT schemaname, tablename 
            FROM pg_tables 
            WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
            ORDER BY schemaname, tablename;
        """)
        tables = cursor.fetchall()
        
        if tables:
            print(f"\nFound {len(tables)} tables:")
            for schema, table in tables:
                print(f"  {schema}.{table}")
        else:
            print("\nNo user tables found.")
        
        # Close connection
        cursor.close()
        conn.close()
        
        print("\n✅ Database test completed successfully!")
        
    except psycopg2.Error as e:
        print(f"❌ Database connection failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_database_connection()