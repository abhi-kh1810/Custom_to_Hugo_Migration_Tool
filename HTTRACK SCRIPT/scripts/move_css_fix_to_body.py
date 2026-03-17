#!/usr/bin/env python3
"""
Move css-fix.js from head to end of body for all HTML pages
"""
import re
from pathlib import Path

SITE_DIR = Path(__file__).parent.parent / "public/reorg/www.dejadefumarconayuda.es"
CSS_FIX_SCRIPT = '<script src="/js/css-fix.js"></script>'

def move_css_fix_to_body(filepath):
    """Move css-fix.js from head to end of body"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Remove css-fix.js from anywhere in the file
    content = re.sub(r'<script[^>]*src=["\'][^"\']*css-fix\.js[^"\']*["\'][^>]*></script>\s*', '', content, flags=re.IGNORECASE)
    
    # Add it before </body>
    body_match = re.search(r'(</body>)', content)
    if body_match:
        insert_pos = body_match.start()
        # Check if it's already there (shouldn't be after removal)
        if 'css-fix.js' not in content[insert_pos-200:insert_pos]:
            content = content[:insert_pos] + '\n' + CSS_FIX_SCRIPT + '\n' + content[insert_pos:]
    
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    """Process all HTML files"""
    html_files = list(SITE_DIR.rglob('*.html'))
    print(f"Found {len(html_files)} HTML files")
    
    fixed_count = 0
    for html_file in html_files:
        if move_css_fix_to_body(html_file):
            fixed_count += 1
            rel_path = html_file.relative_to(SITE_DIR.parent.parent.parent)
            print(f"Fixed: {rel_path}")
    
    print(f"\nDone! Fixed {fixed_count} out of {len(html_files)} files.")

if __name__ == '__main__':
    main()

