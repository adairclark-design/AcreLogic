from playwright.sync_api import sync_playwright

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://localhost:8081/yield") # Requires app to be running
        page.screenshot(path="/Users/adairclark/.gemini/antigravity/brain/40cbdc6f-7ecc-41d1-8a28-95c399e3ab9c/yield_summary.png")
        browser.close()
# test()
