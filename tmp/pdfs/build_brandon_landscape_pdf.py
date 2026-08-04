from pathlib import Path

from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


ROOT = Path(__file__).resolve().parents[2]
FRAME_DIR = ROOT / "tmp" / "pdfs"
OUTPUT = ROOT / "output" / "pdf" / "brandon-roofing-homepage-landscape.pdf"
PREPARED = FRAME_DIR / "prepared"

# The browser viewport is 1440x900, while the in-app browser's captured page
# content is 1430px wide. The final PDF keeps that wide presentation ratio.
PAGE_WIDTH = 1029.6
PAGE_HEIGHT = 648.0


def prepare_frame(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB")

    # Remove the slim in-app scrollbar at the right edge.
    image = image.crop((0, 0, image.width - 10, image.height))

    # The development server adds a small circular dev indicator at bottom-left.
    # Extend the adjacent page background over it without affecting site content.
    patch = image.crop((66, image.height - 105, 92, image.height))
    patch = patch.resize((68, 105), Image.Resampling.BICUBIC)
    image.paste(patch, (0, image.height - 105))

    image.save(destination, "JPEG", quality=94, optimize=True, progressive=True)


def main() -> None:
    PREPARED.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    # Curated section-by-section sequence. The navigation appears only on the
    # opening frame; every later frame is captured after it has scrolled away.
    frames = [FRAME_DIR / f"brandon-frame-{number:02d}.jpg" for number in range(1, 8)]
    frames += [
        FRAME_DIR / "brandon-frame-review.jpg",
        FRAME_DIR / "brandon-frame-08.jpg",
        FRAME_DIR / "brandon-frame-09.jpg",
    ]
    missing = [frame.name for frame in frames if not frame.exists()]
    if missing:
        raise RuntimeError(f"Missing landscape frames: {missing}")

    prepared_frames = []
    for frame in frames:
        prepared = PREPARED / frame.name
        prepare_frame(frame, prepared)
        prepared_frames.append(prepared)

    pdf = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_WIDTH, PAGE_HEIGHT), pageCompression=1)
    pdf.setTitle("Brandon Roofing - Homepage Concept")
    pdf.setAuthor("Bothmade")
    pdf.setSubject("Landscape homepage UI concept for Brandon Roofing")

    for frame in prepared_frames:
        pdf.drawImage(
            ImageReader(str(frame)),
            0,
            0,
            width=PAGE_WIDTH,
            height=PAGE_HEIGHT,
            preserveAspectRatio=False,
            mask="auto",
        )
        pdf.showPage()

    pdf.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
