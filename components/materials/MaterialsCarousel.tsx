"use client";

import { useEffect, useRef, useState } from "react";

import { carouselMaterials as materials } from "@/lib/materials/catalog";

const duration = 35000;

export function MaterialsCarousel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const manual = reducedMotion || keyboardMode;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const group = track?.firstElementChild;
    if (!viewport || !track || !group || manual) return;

    viewport.scrollLeft = 0;
    let animation: Animation;
    let width = 0;
    let visible = false;
    let hovered = false;
    let pointer: { id: number; x: number; y: number; phase: number; dragging: boolean } | null = null;
    let suppressClickUntil = 0;

    const sync = () => {
      if (!animation) return;
      if (visible && !document.hidden && !hovered && !pointer) animation.play();
      else animation.pause();
    };
    const resize = () => {
      const nextWidth = group.getBoundingClientRect().width;
      if (nextWidth === width) return;
      if (animation) phaseRef.current = Number(animation.currentTime ?? 0) % duration;
      animation?.cancel();
      width = nextWidth;
      animation = track.animate([
        { transform: "translate3d(0, 0, 0)" },
        { transform: `translate3d(-${width}px, 0, 0)` },
      ], { duration, iterations: Infinity, easing: "linear" });
      animation.currentTime = phaseRef.current;
      sync();
    };
    resize();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(viewport);
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(group);
    const enter = (event: PointerEvent) => { if (event.pointerType === "mouse") { hovered = true; sync(); } };
    const leave = (event: PointerEvent) => { if (event.pointerType === "mouse") { hovered = false; sync(); } };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
        phase: Number(animation.currentTime ?? 0), dragging: false };
      sync();
    };
    const move = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId || !width) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (!pointer.dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        pointer.dragging = true;
        viewport.setPointerCapture(event.pointerId);
      }
      if (!pointer.dragging) return;
      event.preventDefault();
      const phase = pointer.phase - dx / width * duration;
      animation.currentTime = ((phase % duration) + duration) % duration;
    };
    const up = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (pointer.dragging) suppressClickUntil = performance.now() + 250;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      pointer = null;
      sync();
    };
    const click = (event: MouseEvent) => {
      if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
    };
    const preventNativeDrag = (event: DragEvent) => event.preventDefault();
    document.addEventListener("visibilitychange", sync);
    viewport.addEventListener("pointerenter", enter);
    viewport.addEventListener("pointerleave", leave);
    viewport.addEventListener("pointerdown", down);
    viewport.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    viewport.addEventListener("click", click, true);
    viewport.addEventListener("dragstart", preventNativeDrag);
    return () => {
      phaseRef.current = Number(animation.currentTime ?? 0) % duration;
      animation.cancel();
      observer.disconnect();
      sizeObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      viewport.removeEventListener("pointerenter", enter);
      viewport.removeEventListener("pointerleave", leave);
      viewport.removeEventListener("pointerdown", down);
      viewport.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      viewport.removeEventListener("click", click, true);
      viewport.removeEventListener("dragstart", preventNativeDrag);
    };
  }, [manual]);

  useEffect(() => {
    const focused = document.activeElement;
    if (manual && focused instanceof HTMLElement && viewportRef.current?.contains(focused)) {
      focused.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [manual]);

  return (
    <div
      ref={viewportRef}
      className="materials-carousel relative"
      style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: manual ? "auto" : "hidden", overflowY: "hidden" }}
      data-manual={manual}
      role="region"
      aria-label="Materiais Individuais"
      onFocusCapture={(event) => {
        // Touch/mouse focus keeps the existing visual motion; keyboard gets a native scrollable list.
        if (event.target.matches(":focus-visible")) setKeyboardMode(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardMode(false);
      }}
    >
      {/* Keep structural sizing with the markup, including before hydration/CSS refresh. */}
      <div ref={trackRef} className="materials-carousel-track"
        style={{ display: "flex", flexFlow: "row nowrap", width: "max-content" }}>
        {[false, true].map((copy) => (
          <div key={String(copy)} className="materials-carousel-group" aria-hidden={copy || undefined} data-copy={copy}
            style={{ display: copy && manual ? "none" : "flex", flexFlow: "row nowrap", flex: "0 0 auto", gap: "2rem", paddingRight: "2rem" }}>
            {materials.map((item) => (
              <a key={item.image} href="/materiais" tabIndex={copy ? -1 : undefined}
                style={{ display: "block", width: 260, minWidth: 260, maxWidth: 260, flex: "0 0 260px" }}
                className="materials-carousel-card bg-white rounded-2xl overflow-hidden border border-border/60 transition-transform duration-300 hover:scale-[1.03]">
                <div className="relative h-[330px] overflow-hidden"
                  style={{ position: "relative", width: "100%", height: 330, overflow: "hidden" }}>
                  <img
                    src={`/materials-covers/${item.image}-520.webp`}
                    srcSet={[260, 520, 780].map((width) => `/materials-covers/${item.image}-${width}.webp ${width}w`).join(", ")}
                    sizes="260px" width={4419} height={6250}
                    alt={copy ? "" : item.title} loading="lazy" decoding="async" draggable={false}
                    className="w-full h-full object-cover"
                    style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-primary text-lg text-center">{item.title}</h3>
                </div>
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
