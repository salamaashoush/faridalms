/**
 * A picture as a JPEG no longer than `side` on its long edge. A phone photo
 * or a book's page is many megabytes; drawing it again also leaves behind
 * the place and time a photo carried.
 */
export async function shrunkImage(
  file: Blob,
  name: string,
  side = 1600,
): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      side / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("file.failed");
    // A transparent picture lands on white, as on a page.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("file.failed");
    // The name says what the bytes now are, which the upload checks.
    return new File([blob], `${name.replace(/\.[^./]*$/, "")}.jpg`, {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
