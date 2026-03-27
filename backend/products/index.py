"""Получение списка товаров из базы данных."""
import json
import os
import psycopg2


SCHEMA = "t_p33261395_self_service_kassa"


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def handler(event: dict, context) -> dict:
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    conn = get_conn()
    cur = conn.cursor()

    category = (event.get("queryStringParameters") or {}).get("category")
    barcode = (event.get("queryStringParameters") or {}).get("barcode")

    if barcode:
        cur.execute(
            f"SELECT id, name, price, category, emoji, barcode, image_url FROM {SCHEMA}.products WHERE barcode = %s AND is_active = TRUE",
            (barcode,)
        )
        row = cur.fetchone()
        if row:
            product = {
                "id": row[0], "name": row[1], "price": row[2],
                "category": row[3], "emoji": row[4],
                "barcode": row[5], "image": row[6],
            }
            cur.close()
            conn.close()
            return {"statusCode": 200, "headers": headers, "body": json.dumps({"product": product})}
        else:
            cur.close()
            conn.close()
            return {"statusCode": 404, "headers": headers, "body": json.dumps({"error": "Товар не найден"})}

    if category and category != "Все":
        cur.execute(
            f"SELECT id, name, price, category, emoji, barcode, image_url FROM {SCHEMA}.products WHERE category = %s AND is_active = TRUE ORDER BY id",
            (category,)
        )
    else:
        cur.execute(
            f"SELECT id, name, price, category, emoji, barcode, image_url FROM {SCHEMA}.products WHERE is_active = TRUE ORDER BY id"
        )

    rows = cur.fetchall()
    products = [
        {"id": r[0], "name": r[1], "price": r[2], "category": r[3], "emoji": r[4], "barcode": r[5], "image": r[6]}
        for r in rows
    ]
    cur.close()
    conn.close()
    return {"statusCode": 200, "headers": headers, "body": json.dumps({"products": products})}
