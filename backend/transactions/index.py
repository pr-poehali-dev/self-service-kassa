"""Создание транзакций и получение истории продаж."""
import json
import os
import psycopg2


SCHEMA = "t_p33261395_self_service_kassa"


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def handler(event: dict, context) -> dict:
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    method = event.get("httpMethod", "GET")

    if method == "GET":
        conn = get_conn()
        cur = conn.cursor()

        cur.execute(
            f"""
            SELECT t.id, t.total, t.tax_amount, t.payment_method, t.created_at
            FROM {SCHEMA}.transactions t
            ORDER BY t.created_at DESC
            LIMIT 100
            """
        )
        txs = cur.fetchall()

        result = []
        for tx in txs:
            tx_id = tx[0]
            cur.execute(
                f"""
                SELECT product_name, product_price, product_emoji, qty
                FROM {SCHEMA}.transaction_items
                WHERE transaction_id = %s
                """,
                (tx_id,)
            )
            items = [
                {"name": r[0], "price": r[1], "emoji": r[2], "qty": r[3]}
                for r in cur.fetchall()
            ]
            result.append({
                "id": str(tx_id),
                "total": tx[1],
                "tax_amount": tx[2],
                "method": tx[3],
                "date": tx[4].isoformat(),
                "items": items,
            })

        cur.close()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"transactions": result})}

    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        items = body.get("items", [])
        total = body.get("total", 0)
        tax_amount = body.get("tax_amount", 0)
        payment_method = body.get("payment_method", "Карта")

        if not items or total <= 0:
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Некорректные данные"})}

        conn = get_conn()
        cur = conn.cursor()

        cur.execute(
            f"INSERT INTO {SCHEMA}.transactions (total, tax_amount, payment_method) VALUES (%s, %s, %s) RETURNING id",
            (total, tax_amount, payment_method)
        )
        tx_id = cur.fetchone()[0]

        for item in items:
            cur.execute(
                f"""
                INSERT INTO {SCHEMA}.transaction_items
                  (transaction_id, product_id, product_name, product_price, product_emoji, qty)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (tx_id, item["id"], item["name"], item["price"], item.get("emoji", "📦"), item["qty"])
            )

        conn.commit()
        cur.close()
        conn.close()

        return {"statusCode": 201, "headers": headers, "body": json.dumps({"id": str(tx_id), "success": True})}

    return {"statusCode": 405, "headers": headers, "body": json.dumps({"error": "Method not allowed"})}
