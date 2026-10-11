from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    # Capture console messages
    console_messages = []
    page.on("console", lambda msg: console_messages.append(f"{msg.type}: {msg.text}"))
    
    # Capture page errors
    page_errors = []
    page.on("pageerror", lambda err: page_errors.append(str(err)))
    
    # Navigate to home page
    page.goto('http://localhost:3000', wait_until='networkidle')
    
    # Wait a bit for client-side loading
    page.wait_for_timeout(3000)
    
    # Take screenshot
    page.screenshot(path='/tmp/home_page.png', full_page=True)
    
    # Get page content
    content = page.content()
    
    print("=== CONSOLE MESSAGES ===")
    for msg in console_messages:
        print(msg)
    
    print("\n=== PAGE ERRORS ===")
    for err in page_errors:
        print(err)
    
    print("\n=== PAGE CONTENT (first 5000 chars) ===")
    print(content[:5000])
    
    browser.close()
