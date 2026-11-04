"""Build the dependency-free Android shell using Google's SDK and a JDK 17+.

JAVA_HOME and ANDROID_HOME must point to an installed JDK and Android SDK.
Required packages: platforms;android-35 and build-tools;35.0.0.
The private signing key stays outside the source tree and shared exports.
"""
import hashlib
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
JAVA = Path(os.environ["JAVA_HOME"]) / "bin"
SDK = Path(os.environ["ANDROID_HOME"])
TOOLS = SDK / "build-tools" / "35.0.0"
ANDROID = SDK / "platforms" / "android-35" / "android.jar"
# Some Windows SDK executables cannot read Cyrillic paths. Stage under an ASCII path.
cache = Path(os.environ.get("ROYALE_ANDROID_BUILD_CACHE", Path.home() / ".cache/royale-android"))
cache.mkdir(parents=True, exist_ok=True)
BUILD = Path(tempfile.mkdtemp(prefix="build-", dir=cache))
shutil.copyfile(ROOT / "AndroidManifest.xml", BUILD / "AndroidManifest.xml")
shutil.copytree(ROOT / "src", BUILD / "src")
for folder in (BUILD / "classes", BUILD / "dex", BUILD / "res" / "drawable"):
    folder.mkdir(parents=True, exist_ok=True)
shutil.copyfile(PROJECT / "public/assets/icon-192.png", BUILD / "res/drawable/icon.png")


def run(*args, env=None):
    subprocess.run([str(arg) for arg in args], check=True, env=env)


run(TOOLS / "aapt2.exe", "compile", "--dir", BUILD / "res", "-o", BUILD / "resources.zip")
run(TOOLS / "aapt2.exe", "link", "-o", BUILD / "resources.apk", "-I", ANDROID,
    "--manifest", BUILD / "AndroidManifest.xml", BUILD / "resources.zip")
run(JAVA / "javac.exe", "-encoding", "UTF-8", "-source", "8", "-target", "8",
    "-classpath", ANDROID, "-d", BUILD / "classes", *sorted((BUILD / "src").rglob("*.java")))
with zipfile.ZipFile(BUILD / "classes.jar", "w", zipfile.ZIP_DEFLATED) as jar:
    for entry in sorted((BUILD / "classes").rglob("*.class")):
        jar.write(entry, entry.relative_to(BUILD / "classes").as_posix())
run(JAVA / "java.exe", "-cp", TOOLS / "lib/d8.jar", "com.android.tools.r8.D8", "--release",
    "--min-api", "26", "--lib", ANDROID, "--output", BUILD / "dex", BUILD / "classes.jar")
shutil.copyfile(BUILD / "resources.apk", BUILD / "unsigned.apk")
with zipfile.ZipFile(BUILD / "unsigned.apk", "a", zipfile.ZIP_DEFLATED) as apk:
    for entry in sorted((BUILD / "dex").glob("*.dex")):
        apk.write(entry, entry.name)
run(TOOLS / "zipalign.exe", "-f", "-p", "4", BUILD / "unsigned.apk", BUILD / "aligned.apk")

# Never put this directory into a public source ZIP or Google Drive folder.
signing = Path(os.environ.get("ROYALE_SIGNING_DIR", Path.home() / ".royale-signing"))
signing.mkdir(exist_ok=True)
password_file = signing / "password.txt"
key = signing / "russian-royale.jks"
if key.exists() and not password_file.exists():
    raise RuntimeError("Signing key exists but password.txt is missing; restore it, do not generate a new key.")
if not password_file.exists():
    password_file.write_text(secrets.token_urlsafe(36), encoding="utf-8")
env = dict(os.environ, ROYALE_STORE_PASS=password_file.read_text(encoding="utf-8").strip())
if not key.exists():
    run(JAVA / "keytool.exe", "-genkeypair", "-keystore", key, "-alias", "royale",
        "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000", "-storetype", "JKS",
        "-storepass:env", "ROYALE_STORE_PASS", "-keypass:env", "ROYALE_STORE_PASS",
        "-dname", "CN=Russian Royale, O=Russian Royale, C=AM", env=env)
version = ET.parse(ROOT / "AndroidManifest.xml").getroot().attrib["{http://schemas.android.com/apk/res/android}versionName"]
output = PROJECT / "exports" / f"russian-royale-android-v{version}.apk"
output.parent.mkdir(exist_ok=True)
run(JAVA / "java.exe", "-jar", TOOLS / "lib/apksigner.jar", "sign", "--ks", key,
    "--ks-key-alias", "royale", "--ks-pass", "env:ROYALE_STORE_PASS", "--key-pass",
    "env:ROYALE_STORE_PASS", "--out", BUILD / "signed.apk", BUILD / "aligned.apk", env=env)
run(JAVA / "java.exe", "-jar", TOOLS / "lib/apksigner.jar", "verify", "--verbose", BUILD / "signed.apk")
run(TOOLS / "zipalign.exe", "-c", "4", BUILD / "signed.apk")
run(TOOLS / "aapt2.exe", "dump", "badging", BUILD / "signed.apk")
shutil.copyfile(BUILD / "signed.apk", output)
print(f"APK: {output}\nSHA256: {hashlib.sha256(output.read_bytes()).hexdigest()}")
