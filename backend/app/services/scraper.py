import json
import re
from typing import Optional
from urllib.parse import urlparse, parse_qs
import httpx
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

MOBILE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

def clean_product_url(url: str) -> str:
    """Normalize and strip tracking query parameters (e.g. Amazon /gp/aw/d/ -> clean /dp/)."""
    if not url:
        return ""
    cleaned = url.strip()
    try:
        parsed = urlparse(cleaned)
        netloc = parsed.netloc.lower()
        if "amazon." in netloc or netloc in ("a.co", "amzn.to"):
            # Check for standard ASIN in path
            asin_match = re.search(r'/(?:dp|gp/product|gp/aw/d|d|product)/([A-Z0-9]{10})', parsed.path)
            if asin_match:
                asin = asin_match.group(1)
                return f"https://www.amazon.com/dp/{asin}"
            # Check query params for ASIN
            qs = parse_qs(parsed.query)
            for key in ("asin", "pd_rd_i"):
                if key in qs and qs[key]:
                    val = qs[key][0]
                    if re.match(r'^[A-Z0-9]{10}$', val):
                        return f"https://www.amazon.com/dp/{val}"
    except Exception:
        pass
    return cleaned

def normalize_image_url(url: str) -> str:
    """Ensure image URLs use HTTPS and strip leading double-slashes or whitespace."""
    if not url:
        return ""
    clean = url.strip()
    if clean.startswith("//"):
        return f"https:{clean}"
    if clean.startswith("http://"):
        return f"https://{clean[7:]}"
    return clean

def extract_slug_title(url: str) -> Optional[str]:
    """Extract human-readable product title from URL slug as a resilient fallback."""
    try:
        parsed = urlparse(url)
        match = re.search(r'/([^/]+)/(?:dp|gp/product|product)/[A-Z0-9]{10}', parsed.path)
        if match:
            slug = match.group(1).replace("-", " ").strip()
            if len(slug) > 5 and not slug.lower().startswith("gp"):
                return slug
    except Exception:
        pass
    return None

async def scrape_product_url(url: str) -> dict:
    result = {
        "title": "",
        "description": "",
        "image_url": "",
        "price": None,
        "currency": "USD",
        "vendor": "",
        "clean_url": url.strip() if url else "",
    }
    if not url or not url.startswith(("http://", "https://")):
        return result

    raw_url = url.strip()
    cleaned_url = clean_product_url(raw_url)
    result["clean_url"] = cleaned_url

    parsed = urlparse(raw_url)
    domain = parsed.netloc.lower()

    if "amazon." in domain or domain in ("a.co", "amzn.to"):
        result["vendor"] = "Amazon"
    elif "target." in domain:
        result["vendor"] = "Target"
    elif "walmart." in domain:
        result["vendor"] = "Walmart"
    elif "etsy." in domain:
        result["vendor"] = "Etsy"
    elif "bestbuy." in domain:
        result["vendor"] = "Best Buy"

    slug_fallback_title = extract_slug_title(raw_url)

    # Quick Shopify / Indie Boutique .json check if URL has /products/
    if "/products/" in parsed.path:
        handle_match = re.search(r'/products/([^/?#]+)', parsed.path)
        if handle_match:
            handle = handle_match.group(1)
            scheme = parsed.scheme or "https"
            json_url = f"{scheme}://{parsed.netloc}/products/{handle}.json"
            try:
                async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers=HEADERS) as jclient:
                    j_resp = await jclient.get(json_url)
                    if j_resp.status_code == 200:
                        prod = j_resp.json().get("product", {})
                        if prod.get("title"):
                            result["title"] = prod["title"].strip()
                        if prod.get("vendor"):
                            result["vendor"] = prod["vendor"].strip()
                        if prod.get("images") and len(prod["images"]) > 0:
                            result["image_url"] = prod["images"][0].get("src", "")
                        if prod.get("variants") and len(prod["variants"]) > 0:
                            p = prod["variants"][0].get("price")
                            if p:
                                try:
                                    result["price"] = float(str(p).replace("$", "").replace(",", "").strip())
                                except ValueError:
                                    pass
                        if prod.get("body_html"):
                            clean_desc = re.sub(r'<[^>]+>', ' ', prod["body_html"])
                            result["description"] = re.sub(r'\s+', ' ', clean_desc).strip()[:300]
                        if result["title"]:
                            if result["image_url"]:
                                result["image_url"] = normalize_image_url(result["image_url"])
                            return result
            except Exception:
                pass

    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=HEADERS) as client:
            resp = await client.get(cleaned_url)
            if resp.status_code != 200 and cleaned_url != raw_url:
                resp = await client.get(raw_url)

            if resp.status_code != 200 or "robot check" in resp.text[:2000].lower():
                try:
                    resp_mob = await client.get(raw_url, headers=MOBILE_HEADERS)
                    if resp_mob.status_code == 200 and "robot check" not in resp_mob.text[:2000].lower():
                        resp = resp_mob
                except Exception:
                    pass

            if resp.status_code != 200:
                print(f"[scraper] HTTP {resp.status_code} for {url}")
                if slug_fallback_title:
                    result["title"] = slug_fallback_title
                return result

            html = resp.text
            soup = BeautifulSoup(html, "html.parser")

            # 1. Amazon-Specific DOM Selectors
            if "amazon." in domain or domain in ("a.co", "amzn.to"):
                page_title = (soup.title.string or "").strip() if soup.title else ""
                is_bot_check = any(b in page_title.lower() for b in ["robot check", "captcha", "sorry! something went wrong", "automated access"])

                if not is_bot_check:
                    title_elem = (
                        soup.find("span", {"id": "productTitle"})
                        or soup.find("h1", {"id": "title"})
                        or soup.find("span", {"id": "ebooksProductTitle"})
                    )
                    if title_elem:
                        result["title"] = title_elem.get_text(strip=True)

                    img_elem = soup.find("img", {"id": "landingImage"}) or soup.find("img", {"id": "main-image"}) or soup.find("img", {"id": "imgBlkFront"})
                    if img_elem:
                        dyn_img = img_elem.get("data-a-dynamic-image")
                        if dyn_img:
                            try:
                                dyn_data = json.loads(dyn_img)
                                if isinstance(dyn_data, dict) and dyn_data:
                                    best_img = max(dyn_data.items(), key=lambda kv: kv[1][0] * kv[1][1] if isinstance(kv[1], (list, tuple)) and len(kv[1]) >= 2 else 0)[0]
                                    result["image_url"] = best_img
                            except Exception:
                                pass
                        if not result["image_url"]:
                            result["image_url"] = img_elem.get("src") or img_elem.get("data-old-hires") or ""

                    price_whole = soup.find("span", {"class": "a-price-whole"})
                    if price_whole:
                        fraction = soup.find("span", {"class": "a-price-fraction"})
                        f_val = fraction.get_text(strip=True) if fraction else "00"
                        whole_clean = price_whole.get_text(strip=True).replace(".", "").replace(",", "")
                        try:
                            result["price"] = float(f"{whole_clean}.{f_val}")
                        except ValueError:
                            pass

                    if result["price"] is None:
                        for offscreen in soup.find_all("span", {"class": "a-offscreen"}):
                            text = offscreen.get_text(strip=True)
                            match = re.search(r'\$([0-9]+(?:\.[0-9]{2})?)', text)
                            if match:
                                try:
                                    result["price"] = float(match.group(1))
                                    break
                                except ValueError:
                                    pass

                    if result["price"] is None:
                        input_price = soup.find("input", {"id": "attach-base-product-price"})
                        if input_price and input_price.get("value"):
                            try:
                                result["price"] = float(input_price["value"].strip())
                            except ValueError:
                                pass

            # 2. OpenGraph Fallbacks
            if not result["title"]:
                og_title = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "og:title"})
                if og_title and og_title.get("content"):
                    clean = re.sub(r'^(?:Amazon\.com:\s*|Target:\s*|Walmart:\s*)', '', og_title["content"].strip())
                    if not any(b in clean.lower() for b in ["robot check", "captcha", "sorry! something went wrong"]):
                        result["title"] = clean

            if not result["title"] and soup.title and soup.title.string:
                clean_title = re.sub(r'^(?:Amazon\.com:\s*|Target:\s*|Walmart:\s*)', '', soup.title.string.strip())
                if not any(b in clean_title.lower() for b in ["robot check", "captcha", "sorry! something went wrong"]):
                    result["title"] = clean_title.strip()

            if not result["title"] and slug_fallback_title:
                result["title"] = slug_fallback_title

            if not result["image_url"]:
                og_image = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"})
                if og_image and og_image.get("content"):
                    result["image_url"] = og_image["content"].strip()

            if not result["description"]:
                og_desc = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"})
                if og_desc and og_desc.get("content"):
                    desc = og_desc["content"].strip()
                    if not any(b in desc.lower() for b in ["robot check", "captcha"]):
                        result["description"] = desc

            if not result["vendor"]:
                og_site = soup.find("meta", property="og:site_name")
                if og_site and og_site.get("content"):
                    result["vendor"] = og_site["content"].strip()

            # 3. JSON-LD Schema.org parsing
            if result["price"] is None or not result["image_url"]:
                for script in soup.find_all("script", type="application/ld+json"):
                    try:
                        data = json.loads(script.string or "")
                        items = data if isinstance(data, list) else [data]
                        for item in items:
                            if not isinstance(item, dict):
                                continue
                            if item.get("@type") in ("Product", "Offer", "IndividualProduct"):
                                if not result["title"] and item.get("name"):
                                    result["title"] = item["name"].strip()
                                offers = item.get("offers")
                                if isinstance(offers, list) and offers:
                                    offers = offers[0]
                                if isinstance(offers, dict) and result["price"] is None:
                                    p = offers.get("price") or offers.get("lowPrice")
                                    if p:
                                        try:
                                            result["price"] = float(str(p).replace("$", "").replace(",", "").strip())
                                            result["currency"] = str(offers.get("priceCurrency", "USD")).upper()
                                        except ValueError:
                                            pass
                                if not result["image_url"] and item.get("image"):
                                    img = item["image"]
                                    result["image_url"] = img[0] if isinstance(img, list) else (img.get("url") if isinstance(img, dict) else str(img))
                    except Exception:
                        continue

            # 4. OpenGraph and Meta Price tags (Shopify, WooCommerce, etc.)
            if result["price"] is None:
                for meta_tag in ["og:price:amount", "product:price:amount", "price", "product:price"]:
                    p_meta = soup.find("meta", property=meta_tag) or soup.find("meta", attrs={"name": meta_tag})
                    if p_meta and p_meta.get("content"):
                        try:
                            result["price"] = float(p_meta["content"].replace("$", "").replace(",", "").strip())
                            break
                        except ValueError:
                            pass

            # 5. Fallback Regex Price Search
            if result["price"] is None:
                match = re.search(r'\$([0-9]{1,4}(?:\.[0-9]{2})?)', html[:40000])
                if match:
                    try:
                        result["price"] = float(match.group(1))
                    except ValueError:
                        pass

    except Exception as e:
        print(f"[scraper] Error scraping {url}: {e}")
        if slug_fallback_title and not result["title"]:
            result["title"] = slug_fallback_title

    if result["image_url"]:
        result["image_url"] = normalize_image_url(result["image_url"])

    return result
