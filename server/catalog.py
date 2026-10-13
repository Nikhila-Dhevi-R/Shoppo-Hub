import hashlib
import json
import re


PRODUCTS = {
    1: {"id": 1, "name": "Smart Watch", "price": 4999},
    2: {"id": 2, "name": "Headphones", "price": 1999},
    3: {"id": 3, "name": "T Shirt", "price": 799},
    4: {"id": 4, "name": "Shoes", "price": 2999},
    5: {"id": 5, "name": "Original Graphic Tee", "price": 999},
    6: {"id": 6, "name": "Imagine Peace Oversized Tee", "price": 1199},
    7: {"id": 7, "name": "Circuit Warrior Tee", "price": 1299},
    8: {"id": 8, "name": "Vintage Slogan Tee", "price": 899},
    9: {"id": 9, "name": "Court Street Sneakers", "price": 2499},
    10: {"id": 10, "name": "Sand and Maroon Sneakers", "price": 3299},
    11: {"id": 11, "name": "Glossy Gray Loafers", "price": 2199},
    12: {"id": 12, "name": "Black TWS Earbuds", "price": 1799},
    13: {"id": 13, "name": "Blue TWS Earbuds", "price": 2499},
    14: {"id": 14, "name": "Clear Wired IEM Earphones", "price": 1499},
    15: {"id": 15, "name": "Everyday Wired Earphones", "price": 499},
    16: {"id": 16, "name": "Neon Red Gaming Mouse", "price": 899},
    17: {"id": 17, "name": "Cloud White Wireless Mouse", "price": 699},
    18: {"id": 18, "name": "RGB Gaming Mouse", "price": 1499},
    19: {"id": 19, "name": "Anime Wireless Mouse", "price": 1199},
}
PHONE_PATTERN = re.compile(r"^\+?[0-9 ()-]+$")


def order_fingerprint(items, delivery):
    payload = {
        "items": [{"id": item["id"], "quantity": item["quantity"]} for item in items],
        "delivery": delivery,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalize_order(items_value, delivery_value):
    if not isinstance(items_value, list) or not items_value:
        raise ValueError("Your cart is empty.")
    if not isinstance(delivery_value, dict):
        raise ValueError("Enter your delivery details.")

    quantities = {}
    for item in items_value:
        if not isinstance(item, dict):
            raise ValueError("Your cart contains an invalid product.")

        product_id = item.get("id")
        quantity = item.get("quantity")
        if isinstance(product_id, bool) or not isinstance(product_id, int) or product_id not in PRODUCTS:
            raise ValueError("Your cart contains an unavailable product.")
        if isinstance(quantity, bool) or not isinstance(quantity, int) or not 1 <= quantity <= 99:
            raise ValueError("Product quantities must be between 1 and 99.")

        quantities[product_id] = quantities.get(product_id, 0) + quantity
        if quantities[product_id] > 99:
            raise ValueError("A product quantity cannot exceed 99.")

    name = delivery_value.get("name")
    address = delivery_value.get("address")
    phone = delivery_value.get("phone")
    if not all(isinstance(value, str) for value in (name, address, phone)):
        raise ValueError("Complete your name, address, and phone number.")

    name = name.strip()
    address = address.strip()
    phone = phone.strip()
    if not 1 <= len(name) <= 120:
        raise ValueError("Enter a name between 1 and 120 characters.")
    if not 5 <= len(address) <= 300:
        raise ValueError("Enter an address between 5 and 300 characters.")
    digit_count = sum(character.isdigit() for character in phone)
    if not 7 <= digit_count <= 15 or not PHONE_PATTERN.fullmatch(phone):
        raise ValueError("Enter a phone number with 7 to 15 digits.")

    items = [
        {**PRODUCTS[product_id], "quantity": quantity}
        for product_id, quantity in sorted(quantities.items())
    ]
    delivery = {"name": name, "address": address, "phone": phone}
    total = sum(item["price"] * item["quantity"] for item in items)
    return items, delivery, total
