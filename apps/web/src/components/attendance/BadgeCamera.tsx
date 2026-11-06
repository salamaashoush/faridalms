import { Button } from "@faridalms/ui/button";
import { SwitchCamera, VideoOff } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import * as m from "~/i18n/messages";

import { badgeSecret, qrReader } from "./badgeReader";

/** How often a frame is read; enough for a badge held up, light on a tablet. */
const EVERY_MS = 300;
/** A badge still in front of the camera is not read twice in this time. */
const AGAIN_MS = 5000;

export interface BadgeCameraProps {
  onBadge: (secret: string) => void;
}

/**
 * A camera a child holds their badge up to. It reads each badge once while
 * it stays in view and hands its secret on; the front camera faces a
 * classroom board's children, and the back one serves a teacher's tablet.
 */
export function BadgeCamera({ onBadge }: BadgeCameraProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [failed, setFailed] = useState(false);
  const read = useEffectEvent(onBadge);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const seen = new Map<string, number>();
    const look = async () => {
      const frame = video.current;
      if (stopped || !frame) return;
      if (frame.readyState >= 2) {
        const codes = await (await qrReader()).detect(frame).catch(() => []);
        for (const code of codes) {
          const secret = badgeSecret(code.rawValue);
          const now = Date.now();
          if (secret && now - (seen.get(secret) ?? 0) > AGAIN_MS) {
            seen.set(secret, now);
            read(secret);
          }
        }
      }
      timer = setTimeout(() => void look(), EVERY_MS);
    };
    // Pages served without HTTPS have no cameras at all.
    const devices = navigator.mediaDevices as MediaDevices | undefined;
    void (
      devices
        ? devices.getUserMedia({ video: { facingMode: facing }, audio: false })
        : Promise.reject(new Error("camera.none"))
    )
      .then((opened) => {
        if (stopped) {
          for (const track of opened.getTracks()) track.stop();
          return;
        }
        stream = opened;
        setFailed(false);
        if (video.current) video.current.srcObject = opened;
        void look();
      })
      .catch(() => setFailed(true));
    return () => {
      stopped = true;
      clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [facing]);

  return (
    <div className="grid justify-items-center gap-3">
      {failed ? (
        <p className="flex max-w-xs items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-lg">
          <VideoOff aria-hidden className="size-6 shrink-0" />
          {m.attCameraOff()}
        </p>
      ) : (
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label={m.attCameraHold()}
          className="aspect-square w-72 rounded-3xl bg-muted object-cover"
          style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
        />
      )}
      <p className="text-center text-xl leading-8 font-semibold">
        {m.attCameraHold()}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setFacing((current) => (current === "user" ? "environment" : "user"))
        }
      >
        <SwitchCamera aria-hidden />
        {m.attCameraSwitch()}
      </Button>
    </div>
  );
}
