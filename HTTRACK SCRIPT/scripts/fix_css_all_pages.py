#!/usr/bin/env python3
"""
Add css-fix.js to all HTML pages in www.dejadefumarconayuda.es
Also removes query parameters from CSS URLs and replaces inline fixes with script reference
"""
import re
from pathlib import Path

SITE_DIR = Path(__file__).parent.parent / "public/reorg/www.dejadefumarconayuda.es"
CSS_FIX_SCRIPT = '<script src="/js/css-fix.js"></script>'

def clean_css_urls(content):
    """Remove query parameters from CSS URLs in link tags"""
    # Remove query parameters from CSS links
    content = re.sub(
        r'(<link[^>]*href=["\'])(/css/[^"\']+\.css)(\?[^"\']+)(["\'])',
        r'\1\2\4',
        content
    )
    return content

def remove_inline_css_fix(content):
    """Remove inline CSS fix scripts (they'll be replaced with css-fix.js)"""
    # Remove the head CSS loader script
    content = re.sub(
        r'<script>\s*// Load CSS immediately[^<]*?</script>',
        '',
        content,
        flags=re.DOTALL
    )
    # Remove the body CSS loader script
    content = re.sub(
        r'<script>\s*// Force load CSS files[^<]*?</script>',
        '',
        content,
        flags=re.DOTALL
    )
    return content

def add_css_fix_script(content, filepath):
    """Add css-fix.js script to HTML file"""
    # Check if already added
    if 'css-fix.js' in content:
        return content, False
    
    # For index.html, replace inline scripts with css-fix.js reference
    is_index = 'index.html' in str(filepath) and filepath.name == 'index.html'
    
    if is_index:
        # Remove inline CSS fix scripts first
        content = remove_inline_css_fix(content)
    
    # Try to add after urlconfiga0fc.js (most common location)
    urlconfig_pattern = r'(<script[^>]*src=["\']/js/urlconfiga0fc\.js[^"\']*["\'][^>]*></script>)'
    match = re.search(urlconfig_pattern, content, re.IGNORECASE)
    
    if match:
        insert_pos = match.end()
        content = content[:insert_pos] + '\n' + CSS_FIX_SCRIPT + content[insert_pos:]
        return content, True
    else:
        # Fallback: add in head after title
        title_match = re.search(r'(</title>)', content)
        if title_match:
            insert_pos = title_match.end()
            content = content[:insert_pos] + '\n' + CSS_FIX_SCRIPT + '\n' + content[insert_pos:]
            return content, True
        else:
            # Last resort: add before </head>
            head_match = re.search(r'(</head>)', content)
            if head_match:
                insert_pos = head_match.start()
                content = content[:insert_pos] + '\n' + CSS_FIX_SCRIPT + '\n' + content[insert_pos:]
                return content, True
    
    return content, False

def fix_html_file(filepath):
    """Fix a single HTML file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # 1. Clean CSS URLs (remove query parameters)
    content = clean_css_urls(content)
    
    # 2. Add css-fix.js script
    content, script_added = add_css_fix_script(content, filepath)
    
    if content != original_content or script_added:
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
        if fix_html_file(html_file):
            fixed_count += 1
            rel_path = html_file.relative_to(SITE_DIR.parent.parent.parent)
            print(f"Fixed: {rel_path}")
    
    print(f"\nDone! Fixed {fixed_count} out of {len(html_files)} files.")

if __name__ == '__main__':
    main()

