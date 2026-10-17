"""Optional UI smoke test: pip install playwright; set CHROME_PATH if needed."""
import json
import os
from pathlib import Path
import time
import urllib.request

from playwright.sync_api import sync_playwright, expect

def rpc(method, params):
    request = urllib.request.Request('http://127.0.0.1:18545',
        data=json.dumps(dict(jsonrpc='2.0', id=1, method=method, params=params)).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request) as response:
        body = json.load(response)
        assert 'error' not in body, body
        return body['result']

with sync_playwright() as pw:
    chrome = os.environ.get('CHROME_PATH')
    if not chrome and os.name == 'nt':
        chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    browser = pw.chromium.launch(headless=True, **({'executable_path': chrome} if chrome else {}))
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5174')
    expect(page.locator('#notice')).to_contain_text('Spectator mode', timeout=30000)
    expect(page.locator('#match-list .card')).not_to_have_count(0)
    page.get_by_role('button', name='Use local wallet').click()
    expect(page.locator('#balance')).to_contain_text('CHEF')
    before = int(page.locator('#match-count').inner_text())
    page.locator('#new-match').click()
    page.locator('#stake').fill('3')
    page.locator('#duration').fill('180')
    page.get_by_role('button', name='Approve stake & create', exact=True).click()
    expect(page.locator('#create-dialog')).not_to_be_visible(timeout=30000)
    expect(page.locator('#match-count')).to_have_text(str(before + 1), timeout=15000)
    match_id = before + 1
    page.locator('#account').select_option('8')
    page.get_by_role('button', name='Use local wallet').click()
    expect(page.locator('#address')).to_contain_text('0x23618')
    page.locator(f'[data-accept="{match_id}"]').click()
    try:
        expect(page.locator(f'[data-accept="{match_id}"]')).to_have_count(0, timeout=30000)
    except AssertionError:
        print('Accept action status:', page.locator('#notice').inner_text(), flush=True)
        print('Browser errors:', errors, flush=True)
        raise
    page.locator(f'[data-open="{match_id}"]').click()
    expect(page.locator('#detail-title')).to_contain_text('Solving')
    expect(page.locator('#player-tools')).to_be_visible()
    page.locator('#submit-code').click()
    expect(page.locator('#notice')).to_contain_text('Delivered to 6/6 verifiers', timeout=30000)
    page.locator('[data-close="match-dialog"]').click()
    page.locator('[data-tab="tournaments"]').click()
    expect(page.locator('#cup-list .card')).not_to_have_count(0)
    page.locator('[data-tab="leaderboard"]').click()
    expect(page.locator('#rankings tr')).not_to_have_count(0)
    page.locator('[data-tab="matches"]').click()
    Path('docs/results').mkdir(parents=True, exist_ok=True)
    page.screenshot(path='docs/results/desktop.png', full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
    page.screenshot(path='docs/results/mobile.png', full_page=True)
    assert not errors, errors
    results = dict(desktop=True, mobile=True, spectator=True, wallet_switch=True,
        create_match=True, accept_match=True, signed_source_delivery='6/6',
        tournaments=True, leaderboard=True, javascript_errors=errors, match_id=match_id)
    Path('docs/results/browser.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))
    browser.close()
