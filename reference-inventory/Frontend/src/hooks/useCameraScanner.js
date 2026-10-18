import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

/**
 * Shared camera (QR / barcode) scanner driver.
 *
 * Upgrades:
 * 1. NATIVE HARDWARE ACCELERATION: Activates browser's native BarcodeDetector API
 *    (Google ML Kit / Apple Vision) when supported for ultra-fast, high-accuracy QR/Barcode decode.
 * 2. TARGETED FORMATS: Focused on QR_CODE, CODE_128, CODE_39, EAN_13, etc., avoiding CPU waste
 *    on obscure symbologies.
 * 3. HIGH-RES & CONTINUOUS FOCUS: Requests HD/Full-HD stream with continuous autofocus so dense
 *    or small QR codes on product labels are sharp and immediately recognized.
 * 4. TORCH (FLASHLIGHT): Exposes `hasTorch`, `isTorchOn`, and `toggleTorch()` for dark warehouse areas.
 * 5. HAPTIC FEEDBACK: Vibrates mobile device on successful decode.
 */

const SHUTTERED_VIEWFINDER_ID = 'qr-shaded-region';

export function hideLibraryViewfinder() {
  if (typeof document === 'undefined') return;
  const stale = document.getElementById(SHUTTERED_VIEWFINDER_ID);
  if (stale?.parentNode) stale.parentNode.removeChild(stale);
}

export const isDesktopViewport = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(min-width: 768px)').matches;

const INVENTORY_BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.ITF,
];

/**
 * Resolve camera constraint for the current device.
 * Phones: prefer the rear camera with continuous focus. Desktop: first webcam.
 */
async function resolveCameraConstraint(preferEnvironment) {
  const fallback = { facingMode: preferEnvironment ? 'environment' : 'user' };
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return fallback;
  }
  try {
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'videoinput'
    );
    if (!cameras.length) return fallback;

    const rear = cameras.find((d) => /back|rear|environment/i.test(d.label || ''));
    if (rear && rear.deviceId) {
      return { deviceId: { exact: rear.deviceId } };
    }
    if (rear) return { facingMode: 'environment' };

    if (cameras.length === 1 && cameras[0].deviceId) {
      return { deviceId: { exact: cameras[0].deviceId } };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function getCameraStartError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Izin kamera ditolak. Aktifkan izin kamera pada browser lalu coba lagi.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'Kamera tidak ditemukan. Pastikan webcam/kamera perangkat aktif, atau gunakan input manual.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera lalu coba lagi.';
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Kamera hanya bisa diakses lewat HTTPS atau localhost.';
  }
  return null;
}

export function useCameraScanner({
  elementId,
  active,
  onDecode,
  onError,
  fps = 15,
  preferEnvironment = true,
  deps = [],
}) {
  const [cameraActive, setCameraActive] = useState(false);
  const [frameHit, setFrameHit] = useState(0);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const instanceRef = useRef(null);
  const videoTrackRef = useRef(null);
  const onDecodeRef = useRef(onDecode);
  const onErrorRef = useRef(onError);
  const lastHitTextRef = useRef('');

  useEffect(() => { onDecodeRef.current = onDecode; }, [onDecode]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const flashFrame = useCallback((text) => {
    if (lastHitTextRef.current === text) return;
    lastHitTextRef.current = text;
    setFrameHit((n) => n + 1);

    // Haptic feedback for mobile devices
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(70); } catch (_) {}
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = videoTrackRef.current;
    if (!track) return;
    try {
      const nextState = !isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('Gagal mengubah status senter/torch:', err);
    }
  }, [isTorchOn]);

  useEffect(() => {
    if (!active) {
      hideLibraryViewfinder();
      setHasTorch(false);
      setIsTorchOn(false);
      videoTrackRef.current = null;
      return undefined;
    }
    if (typeof document === 'undefined') return undefined;
    if (!navigator?.mediaDevices?.getUserMedia) {
      onErrorRef.current?.('Browser tidak mendukung akses kamera. Gunakan input manual.');
      return undefined;
    }

    let disposed = false;
    let qrcode;
    try {
      qrcode = new Html5Qrcode(elementId, {
        formatsToSupport: INVENTORY_BARCODE_FORMATS,
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
        verbose: false,
      });
    } catch (err) {
      console.error('Camera scanner mount error:', err);
      onErrorRef.current?.('Kamera tidak dapat dibuka. Gunakan input manual.');
      return undefined;
    }
    instanceRef.current = qrcode;

    (async () => {
      try {
        const camera = await resolveCameraConstraint(preferEnvironment);
        if (disposed) return;

        // Try high-resolution stream with continuous focus first
        const hdScanConfig = {
          fps: Math.max(fps, 15),
          disableFlip: true,
          videoConstraints: {
            ...camera,
            width: { min: 640, ideal: 1920, max: 2560 },
            height: { min: 480, ideal: 1080, max: 1440 },
            focusMode: 'continuous',
            advanced: [{ focusMode: 'continuous' }],
          },
        };

        const onDecodeSuccess = (decodedText) => {
          const text = String(decodedText ?? '').trim();
          if (!text) return;
          flashFrame(text);
          onDecodeRef.current?.(text);
        };

        try {
          await qrcode.start(camera, hdScanConfig, onDecodeSuccess, () => {});
        } catch (initialErr) {
          // If constraints were rejected (e.g. webcam doesn't support 1080p), retry with basic constraint
          if (disposed) return;
          console.warn('Retrying camera with default constraints...', initialErr);
          await qrcode.start(
            camera,
            { fps: Math.max(fps, 12), disableFlip: true },
            onDecodeSuccess,
            () => {}
          );
        }

        if (disposed) {
          await qrcode.stop().catch(() => {});
          return;
        }

        // Detect video track capabilities for Torch and Focus
        try {
          const videoEl = document.querySelector(`#${elementId} video`);
          const stream = videoEl?.srcObject;
          const track = stream?.getVideoTracks()?.[0];
          if (track) {
            videoTrackRef.current = track;
            const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
            if (caps.torch) {
              setHasTorch(true);
            }
            // Ensure continuous focus if supported
            if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
              await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
            }
          }
        } catch (_) {}

        setCameraActive(true);
      } catch (err) {
        if (disposed) return;
        console.error('Camera scan start error:', err);
        setCameraActive(false);
        onErrorRef.current?.(getCameraStartError(err) ?? 'Gagal mengakses kamera. Gunakan input manual.');
      }
    })();

    return () => {
      disposed = true;
      const instance = instanceRef.current;
      instanceRef.current = null;
      videoTrackRef.current = null;
      setCameraActive(false);
      setHasTorch(false);
      setIsTorchOn(false);
      if (instance) {
        if (instance.isScanning) instance.stop().catch(() => {});
      }
      hideLibraryViewfinder();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, elementId, fps, preferEnvironment, ...deps]);

  return { cameraActive, frameHit, hasTorch, isTorchOn, toggleTorch };
}
