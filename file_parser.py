"""
File parser for uploaded resumes/documents.
Supports PDF, DOCX, and TXT files.
"""

import os
import tempfile
from pathlib import Path

ALLOWED_EXTENSIONS = {'pdf', 'docx', 'txt'}
MAX_TEXT_LENGTH = 50_000


def allowed_file(filename: str) -> bool:
    """Check if the file extension is supported."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def parse_uploaded_file(file_storage) -> str:
    """Parse an uploaded file (Flask FileStorage) and return extracted text.

    Args:
        file_storage: A Flask FileStorage object from request.files

    Returns:
        Extracted text content (truncated to MAX_TEXT_LENGTH)

    Raises:
        ValueError: If file type is unsupported or content is empty
    """
    filename = file_storage.filename or ''
    if not allowed_file(filename):
        raise ValueError(
            f"Unsupported file type. Please upload a PDF, DOCX, or TXT file."
        )

    ext = filename.rsplit('.', 1)[1].lower()

    # Save to a temp file for processing
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f'.{ext}')
    try:
        file_storage.save(tmp.name)
        tmp.close()

        if ext == 'pdf':
            text = _parse_pdf(tmp.name)
        elif ext == 'docx':
            text = _parse_docx(tmp.name)
        else:
            text = _parse_txt(tmp.name)
    finally:
        os.unlink(tmp.name)

    text = text.strip()
    if not text:
        raise ValueError("The uploaded file appears to be empty or could not be read.")

    # Truncate if very long
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH]

    return text


def _parse_pdf(filepath: str) -> str:
    """Extract text from a PDF file."""
    from PyPDF2 import PdfReader

    reader = PdfReader(filepath)
    pages = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            pages.append(page_text)
    return '\n'.join(pages)


def _parse_docx(filepath: str) -> str:
    """Extract text from a DOCX file."""
    from docx import Document

    doc = Document(filepath)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return '\n'.join(paragraphs)


def _parse_txt(filepath: str) -> str:
    """Read text from a plain text file."""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()
