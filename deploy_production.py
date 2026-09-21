#!/usr/bin/env python3
"""
NovaFlix Production Deployment Script
=====================================
Automates the deployment checklist for Flutterwave production deployment:

1. Updates lib/subscription_plan.dart - replaces placeholder/dev Flutterwave Plan IDs with real production Plan IDs
2. Updates mobile/.env - sets IS_PRODUCTION=true and replaces FLUTTERWAVE_PUBLIC_KEY with live production key
3. Updates server/schema.sql - replaces placeholder Flutterwave Plan IDs in SQL seed queries
4. Terminal Output: Prints clean console confirmation for each file, plus final warning for manual E2E tests

Requirements:
- Python 3.7+
- flutter_dotenv (for .env loading)
- Run from project root directory

Usage:
    python3 deploy_production.py

Configure your production values in the CONFIG section below before running.
"""

import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Optional


# =============================================================================
# CONFIGURATION - REPLACE THESE VALUES WITH YOUR PRODUCTION CREDENTIALS
# =============================================================================

class Config:
    """Configuration for production deployment. Replace these values with your actual production credentials."""
    
    # Flutterwave Production Plan IDs (get these from Flutterwave Dashboard > Payment Plans)
    # These should match the amounts: Student=800, Basic=1500, Standard=2500, Premium=5500 (all NGN, monthly)
    FLW_PLAN_STUDENT: str = "107086"      # 800 NGN - Student plan
    FLW_PLAN_BASIC: str = "107087"        # e.g. "107087" for 1500 NGN
    FLW_PLAN_STANDARD: str = "107088"     # e.g. "107088" for 2500 NGN
    FLW_PLAN_PREMIUM: str = "107089"      # e.g. "107089" for 5500 NGN
    
    # Flutterwave Production Public Key (from Flutterwave Dashboard > Settings > API)
    FLUTTERWAVE_PUBLIC_KEY: str = "FLWPUBK_LIVE_TEST_KEY_FOR_DEMO"
    
    # Production mode flag
    IS_PRODUCTION: bool = True


# =============================================================================
# PATH RESOLUTION
# =============================================================================

SCRIPT_DIR = Path(__file__).parent.absolute()
PROJECT_ROOT = SCRIPT_DIR  # Assuming script is in project root or scripts/

# File paths relative to project root
PATHS = {
    "subscription_plan": Path("mobile/lib/models/subscription_plan.dart"),
    "env_file": Path("mobile/.env"),
    "schema_sql": Path("server/config/schema.sql"),
}

# Verify paths exist
def verify_paths() -> List[str]:
    """Verify all required files exist. Returns list of missing files."""
    missing = []
    for name, path in PATHS.items():
        full_path = PROJECT_ROOT / path
        if not full_path.exists():
            missing.append(f"{name}: {full_path}")
    return missing


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def print_header(title: str) -> None:
    """Print a formatted section header."""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def print_success(message: str) -> None:
    print(f"  ✓ {message}")

def print_error(message: str) -> None:
    print(f"  ✗ {message}")

def print_warning(message: str) -> None:
    print(f"  ⚠ {message}")

def print_info(message: str) -> None:
    print(f"  → {message}")


# =============================================================================
# FILE UPDATE FUNCTIONS
# =============================================================================

def update_subscription_plan_dart(config: Dict[str, str]) -> Tuple[bool, str]:
    """
    Update lib/subscription_plan.dart with production Flutterwave Plan IDs.
    
    Returns: (success: bool, message: str)
    """
    file_path = PROJECT_ROOT / PATHS["subscription_plan"]
    
    try:
        content = PATHS["subscription_plan"].read_text(encoding="utf-8")
    except FileNotFoundError:
        return False, f"File not found: {PATHS['subscription_plan']}"
    except Exception as e:
        return False, f"Error reading file: {e}"
    
    # Define replacements
    replacements = {
        r"'FLW_PLAN_STUDENT'": f"'{config['FLW_PLAN_STUDENT']}'",
        r"'FLW_PLAN_BASIC'": f"'{config['FLW_PLAN_BASIC']}'",
        r"'FLW_PLAN_STANDARD'": f"'{config['FLW_PLAN_STANDARD']}'",
        r"'FLW_PLAN_PREMIUM'": f"'{config['FLW_PLAN_PREMIUM']}'",
    }
    
    original_content = content
    for pattern, replacement in replacements.items():
        content = re.sub(pattern, replacement, content)
    
    if content == original_content:
        return False, "No changes made - placeholder patterns not found (already updated?)"
    
    try:
        PATHS["subscription_plan"].write_text(content, encoding="utf-8")
        return True, f"Updated {PATHS['subscription_plan']} with production Plan IDs"
    except Exception as e:
        return False, f"Error writing file: {e}"


def update_env_file(config: Dict[str, str]) -> Tuple[bool, str]:
    """
    Update mobile/.env with production values.
    
    Returns: (success: bool, message: str)
    """
    env_path = PROJECT_ROOT / PATHS["env_file"]
    
    try:
        content = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
    except Exception as e:
        return False, f"Error reading .env file: {e}"
    
    # Update or add FLUTTERWAVE_PUBLIC_KEY
    lines = content.splitlines()
    new_lines = []
    key_found = False
    
    for line in lines:
        if line.startswith("FLUTTERWAVE_PUBLIC_KEY="):
            new_lines.append(f"FLUTTERWAVE_PUBLIC_KEY={config['FLUTTERWAVE_PUBLIC_KEY']}")
            key_found = True
        else:
            new_lines.append(line)
    
    if not key_found:
        new_lines.append(f"FLUTTERWAVE_PUBLIC_KEY={config['FLUTTERWAVE_PUBLIC_KEY']}")
    
    # Update or add IS_PRODUCTION
    is_production_str = "true" if config.get("IS_PRODUCTION", True) else "false"
    prod_found = False
    
    final_lines = []
    for line in new_lines:
        if line.startswith("IS_PRODUCTION="):
            final_lines.append(f"IS_PRODUCTION={is_production_str}")
            prod_found = True
        else:
            final_lines.append(line)
    
    if not prod_found:
        final_lines.append(f"IS_PRODUCTION={is_production_str}")
    
    new_content = "\n".join(final_lines)
    
    if new_content == "\n".join(content.splitlines()):
        return False, "No changes made to .env (already up to date?)"
    
    try:
        PATHS["env_file"].write_text(new_content, encoding="utf-8")
        return True, f"Updated {PATHS['env_file']} with production values"
    except Exception as e:
        return False, f"Error writing .env file: {e}"


def update_schema_sql(config: Dict[str, str]) -> Tuple[bool, str]:
    """
    Update server/schema.sql with production Flutterwave Plan IDs.
    
    Returns: (success: bool, message: str)
    """
    schema_path = PROJECT_ROOT / PATHS["schema_sql"]
    
    try:
        content = PATHS["schema_sql"].read_text(encoding="utf-8")
    except FileNotFoundError:
        return False, f"File not found: {PATHS['schema_sql']}"
    except Exception as e:
        return False, f"Error reading schema.sql: {e}"
    
    # Define replacements for the UPDATE statements
    replacements = {
        r"UPDATE plans SET flutterwave_plan_id = '107086' WHERE slug = 'student'":
            f"UPDATE plans SET flutterwave_plan_id = '{config['FLW_PLAN_STUDENT']}' WHERE slug = 'student'",
        r"UPDATE plans SET flutterwave_plan_id = '107087' WHERE slug = 'basic'":
            f"UPDATE plans SET flutterwave_plan_id = '{config['FLW_PLAN_BASIC']}' WHERE slug = 'basic'",
        r"UPDATE plans SET flutterwave_plan_id = '107088' WHERE slug = 'standard'":
            f"UPDATE plans SET flutterwave_plan_id = '{config['FLW_PLAN_STANDARD']}' WHERE slug = 'standard'",
        r"UPDATE plans SET flutterwave_plan_id = '107089' WHERE slug = 'premium'":
            f"UPDATE plans SET flutterwave_plan_id = '{config['FLW_PLAN_PREMIUM']}' WHERE slug = 'premium'",
    }
    
    original_content = content
    for pattern, replacement in replacements.items():
        content = re.sub(pattern, replacement, content)
    
    if content == original_content:
        return False, "No changes made - placeholder IDs not found (already updated?)"
    
    try:
        PROJECT_ROOT.joinpath("server/config/schema.sql").write_text(content, encoding="utf-8")
        return True, f"Updated {PATHS['schema_sql']} with production Plan IDs"
    except Exception as e:
        return False, f"Error writing schema.sql: {e}"


# =============================================================================
# MAIN DEPLOYMENT ORCHESTRATOR
# =============================================================================

def run_deployment() -> bool:
    """Execute the full deployment checklist. Returns True if all steps succeeded."""
    
    print_header("NovaFlix Production Deployment")
    print_info(f"Project root: {PROJECT_ROOT}")
    
    # Verify all paths exist
    missing = verify_paths()
    if missing:
        print_error("Missing required files:")
        for m in missing:
            print_error(f"  - {m}")
        return False
    print_success("All required files found")
    
    # Validate configuration
    config = {
        "FLW_PLAN_STUDENT": Config.FLW_PLAN_STUDENT,
        "FLW_PLAN_BASIC": Config.FLW_PLAN_BASIC,
        "FLW_PLAN_STANDARD": Config.FLW_PLAN_STANDARD,
        "FLW_PLAN_PREMIUM": Config.FLW_PLAN_PREMIUM,
        "FLUTTERWAVE_PUBLIC_KEY": Config.FLUTTERWAVE_PUBLIC_KEY,
        "IS_PRODUCTION": str(Config.IS_PRODUCTION).lower(),
    }
    
    # Validate configuration
    placeholder_pattern = re.compile(r"^YOUR_.*_HERE$")
    placeholders = [k for k, v in config.items() if k.startswith("FLW_PLAN_") and placeholder_pattern.match(v)]
    if placeholders:
        print_warning(f"Placeholder Plan IDs detected: {', '.join(placeholders)}")
        print_warning("Please update Config class with actual Flutterwave Dashboard Plan IDs before deploying.")
        response = "n"
        if response != 'y':
            print_info("Deployment aborted. Please update Config class with real Plan IDs.")
            return False
    
    if config["FLUTTERWAVE_PUBLIC_KEY"].startswith("YOUR_"):
        print_error("FLUTTERWAVE_PUBLIC_KEY not configured (still using placeholder)")
        return False
    
    print_info(f"Production mode: {config['IS_PRODUCTION']}")
    print_info(f"Flutterwave Public Key: {config['FLUTTERWAVE_PUBLIC_KEY'][:20]}...")
    print_info(f"Plan IDs: Student={config['FLW_PLAN_STUDENT']}, Basic={config['FLW_PLAN_BASIC']}, Standard={config['FLW_PLAN_STANDARD']}, Premium={config['FLW_PLAN_PREMIUM']}")
    
    # Execute deployment steps
    all_success = True
    results = []
    
    # Step 1: Update subscription_plan.dart
    print_header("Step 1: Update lib/subscription_plan.dart")
    success, msg = update_subscription_plan_dart({
        "FLW_PLAN_STUDENT": Config.FLW_PLAN_STUDENT,
        "FLW_PLAN_BASIC": Config.FLW_PLAN_BASIC,
        "FLW_PLAN_STANDARD": Config.FLW_PLAN_STANDARD,
        "FLW_PLAN_PREMIUM": Config.FLW_PLAN_PREMIUM,
    })
    if success:
        print_success(msg)
        results.append(("lib/subscription_plan.dart", True, msg))
    else:
        print_error(msg)
        results.append(("lib/subscription_plan.dart", False, msg))
        all_success = False
    
    # Step 2: Update mobile/.env
    print_header("Step 2: Update mobile/.env")
    success, msg = update_env_file({
        "FLUTTERWAVE_PUBLIC_KEY": Config.FLUTTERWAVE_PUBLIC_KEY,
        "IS_PRODUCTION": str(Config.IS_PRODUCTION).lower(),
    })
    if success:
        print_success(msg)
        results.append(("mobile/.env", True, msg))
    else:
        print_error(msg)
        results.append(("mobile/.env", False, msg))
        all_success = False
    
    # Step 3: Update server/schema.sql
    print_header("Step 3: Update server/schema.sql")
    success, msg = update_schema_sql({
        "FLW_PLAN_STUDENT": Config.FLW_PLAN_STUDENT,
        "FLW_PLAN_BASIC": Config.FLW_PLAN_BASIC,
        "FLW_PLAN_STANDARD": Config.FLW_PLAN_STANDARD,
        "FLW_PLAN_PREMIUM": Config.FLW_PLAN_PREMIUM,
    })
    if success:
        print_success(msg)
        results.append(("server/config/schema.sql", True, msg))
    else:
        print_error(msg)
        results.append(("server/config/schema.sql", False, msg))
        all_success = False
    
    # Summary
    print_header("Deployment Summary")
    for file_path, success, msg in results:
        status = "✓" if success else "✗"
        print(f"  {status} {file_path}: {msg}")
    
    if not all_success:
        print_error("\nSome steps failed. Please review and retry.")
        return False
    
    # Final warning
    print_header("⚠️  IMPORTANT - POST-DEPLOYMENT CHECKLIST")
    print_warning("The following manual steps are REQUIRED after deployment:")
    print_warning("1. Run 'flutter pub get' in mobile/ directory")
    print_warning("2. Test on Android device: flutter run --dart-define=FLUTTERWAVE_PUBLIC_KEY=\\$FLUTTERWAVE_PUBLIC_KEY")
    print_warning("3. Test on iOS device: flutter run --dart-define=FLUTTERWAVE_PUBLIC_KEY=\\$FLUTTERWAVE_PUBLIC_KEY")
    print_warning("4. Verify Flutterwave webhook endpoints are configured in Dashboard")
    print_warning("5. Test end-to-end subscription flow: Purchase -> Webhook -> Subscription Active")
    print_warning("")
    print_warning("⚠️  DO NOT SKIP MANUAL E2E TESTING ON PHYSICAL ANDROID & iOS DEVICES")
    
    return all_success


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    try:
        success = run_deployment()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nDeployment cancelled by user.")
        sys.exit(130)
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
