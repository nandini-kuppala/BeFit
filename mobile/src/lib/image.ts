import type * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Enough for OCR on a printed report; a 12 MP original is 4000 px and ~4 MB. */
const DEFAULT_MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

/**
 * Shrinks a photo to `MAX_EDGE` on its long side and re-encodes it as JPEG.
 * Falls back to the original if anything goes wrong — a large upload is
 * better than no upload.
 */
export async function prepareForUpload(
  asset: ImagePicker.ImagePickerAsset,
  MAX_EDGE = DEFAULT_MAX_EDGE,
) {
  const original = { uri: asset.uri, mime: asset.mimeType ?? 'image/jpeg' };
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    const { width, height } = asset;
    if (width && height && Math.max(width, height) > MAX_EDGE) {
      context.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
    }
    const rendered = await context.renderAsync();
    // Dimensions weren't reported by the picker: check the decoded image.
    let ref = rendered;
    if ((!width || !height) && Math.max(rendered.width, rendered.height) > MAX_EDGE) {
      const second = ImageManipulator.manipulate(rendered).resize(
        rendered.width >= rendered.height ? { width: MAX_EDGE } : { height: MAX_EDGE },
      );
      ref = await second.renderAsync();
      second.release();
    }
    const saved = await ref.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    context.release();
    rendered.release();
    if (ref !== rendered) ref.release();
    return { uri: saved.uri, mime: 'image/jpeg' };
  } catch {
    return original;
  }
}
