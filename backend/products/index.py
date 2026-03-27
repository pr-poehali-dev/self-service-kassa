"""CRUD-управление товарами кассы самообслуживания."""
import json
import os
import psycopg2

SCHEMA = "t_p33261395_self_service_kassa"


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def row_to_product(r):
    return {
        "id": r[0], "name": r[1], "price": r[2],
        "category": r[3], "emoji": r[4],
        "barcode": r[5], "image": r[6], "is_active": r[7],
    }


def handler(event: dict, context) -> dict:
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    path = event.get("path", "/")
    # product id из пути: /123
    product_id = None
    parts = [p for p in path.strip("/").split("/") if p]
    if parts and parts[-1].isdigit():
        product_id = int(parts[-1])

    conn = get_conn()
    cur = conn.cursor()

    # GET — список или по штрихкоду
    if method == "GET":
        barcode = params.get("barcode")
        category = params.get("category")
        all_products = params.get("all")  # admin: показать все включая неактивные

        if barcode:
            cur.execute(
                f"SELECT id, name, price, category, emoji, barcode, image_url, is_active FROM {SCHEMA}.products WHERE barcode = %s AND is_active = TRUE",
                (barcode,)
            )
            row = cur.fetchone()
            cur.close(); conn.close()
            if row:
                return {"statusCode": 200, "headers": headers, "body": json.dumps({"product": row_to_product(row)})}
            return {"statusCode": 404, "headers": headers, "body": json.dumps({"error": "Товар не найден"})}

        if all_products:
            cur.execute(f"SELECT id, name, price, category, emoji, barcode, image_url, is_active FROM {SCHEMA}.products ORDER BY id")
        elif category and category != "Все":
            cur.execute(
                f"SELECT id, name, price, category, emoji, barcode, image_url, is_active FROM {SCHEMA}.products WHERE category = %s AND is_active = TRUE ORDER BY id",
                (category,)
            )
        else:
            cur.execute(f"SELECT id, name, price, category, emoji, barcode, image_url, is_active FROM {SCHEMA}.products WHERE is_active = TRUE ORDER BY id")

        rows = cur.fetchall()
        cur.close(); conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"products": [row_to_product(r) for r in rows]})}

    # POST — создать товар
    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        name = body.get("name", "").strip()
        price = body.get("price")
        category = body.get("category", "").strip()
        emoji = body.get("emoji", "📦").strip()
        barcode = body.get("barcode", "").strip()
        image_url = body.get("image_url", "").strip() or None

        if not name or not price or not barcode:
            cur.close(); conn.close()
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Название, цена и штрихкод обязательны"})}

        cur.execute(
            f"INSERT INTO {SCHEMA}.products (name, price, category, emoji, barcode, image_url, is_active) VALUES (%s, %s, %s, %s, %s, %s, TRUE) RETURNING id",
            (name, int(price), category, emoji, barcode, image_url)
        )
        new_id = cur.fetchone()[0]
        conn.commit(); cur.close(); conn.close()
        return {"statusCode": 201, "headers": headers, "body": json.dumps({"id": new_id, "success": True})}

    # PUT — обновить товар
    if method == "PUT" and product_id:
        body = json.loads(event.get("body") or "{}")
        fields = []
        values = []
        for key in ["name", "category", "emoji", "barcode", "image_url"]:
            if key in body:
                fields.append(f"{key} = %s")
                values.append(body[key])
        if "price" in body:
            fields.append("price = %s")
            values.append(int(body["price"]))
        if "is_active" in body:
            fields.append("is_active = %s")
            values.append(bool(body["is_active"]))
        if not fields:
            cur.close(); conn.close()
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Нет полей для обновления"})}
        values.append(product_id)
        cur.execute(f"UPDATE {SCHEMA}.products SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit(); cur.close(); conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"success": True})}

    # DELETE — деактивировать товар (soft delete)
    if method == "DELETE" and product_id:
        cur.execute(f"UPDATE {SCHEMA}.products SET is_active = FALSE WHERE id = %s", (product_id,))
        conn.commit(); cur.close(); conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"success": True})}

    cur.close(); conn.close()
    return {"statusCode": 405, "headers": headers, "body": json.dumps({"error": "Method not allowed"})}
