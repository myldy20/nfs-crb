#include "../performance_overlay.h"
#include "../gpu/fake/fake_device.h"
#include <cstdio>

#define CHECK(x) do { if (!(x)) { std::fprintf(stderr, "FAIL line %d: %s\n", __LINE__, #x); return 1; } } while (0)

int main() {
    gpu::FakeDevice device, other;
    PerformanceOverlay overlay;
    auto target = device.create_texture({640, 480, gpu::Format::RGBA8, gpu::UsageRenderTarget});
    auto cb = device.begin();
    FramePacingSnapshot snapshot;
    CaptureMarker capture;

    CHECK(!overlay.needs_snapshot(&device, 1.0, 0));
    CHECK(overlay.needs_snapshot(&device, 1.0, 1));
    overlay.draw(&device, cb, target, 640, 480, snapshot, 1.0, 1, 60);
    CHECK(!overlay.needs_snapshot(&device, 1.1, 1));
    CHECK(overlay.needs_snapshot(&device, 1.25, 1));
    CHECK(overlay.needs_snapshot(&device, 1.1, 2));
    CHECK(overlay.needs_snapshot(&other, 1.1, 1));
    CHECK(!overlay.needs_snapshot(nullptr, 1.25, 1));
    capture.enabled = true;
    capture.render_frame = 1;
    CHECK(overlay.needs_snapshot(&device, 1.1, 0, capture));
    overlay.draw(&device, cb, target, 640, 480, snapshot, 1.1, 0, 60, capture);
    CHECK(!overlay.needs_snapshot(&device, 1.2, 0, capture));
    capture.render_frame = 2;
    CHECK(overlay.needs_snapshot(&device, 1.2, 0, capture));
    CHECK(!overlay.needs_snapshot(&device, 2.0, 0));
}
