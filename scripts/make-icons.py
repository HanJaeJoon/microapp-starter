#!/usr/bin/env python3
"""아이콘과 스토어 그래픽을 생성한다. (loan-calculator 에서 역전파)

    pip install pillow
    python scripts/make-icons.py

새 앱에서 고칠 것 두 가지:

1. BRAND / TINT 상수 - app.json 의 splash backgroundColor,
   android.adaptiveIcon.backgroundColor 와 각각 같아야 한다.
2. draw_mark() 와 render_feature_graphic() 의 오른쪽 장식 - 아래 구현은
   loan-calculator 의 마크(줄어드는 잔액 막대 3개)와 상환 곡선이다.
   자기 앱의 마크로 교체할 것. 마크를 고를 때의 기준:
   - 48px 파비콘에서도 형태가 남는다 (곡선은 그 크기에서 사라진다)
   - 단색 실루엣(테마 아이콘)으로도 성립한다
   - 앱의 핵심 기능을 그대로 가리킨다

아이콘을 손으로 고친 뒤 이 스크립트를 다시 돌리면 덮어쓰므로,
디자이너가 만든 아이콘으로 교체한 다음에는 이 스크립트를 돌리지 말 것.
"""

import os

from PIL import Image, ImageDraw

# app.json 의 splash backgroundColor 와 같아야 한다
BRAND = (0x1F, 0x6F, 0x54)
# app.json 의 android.adaptiveIcon.backgroundColor 와 같아야 한다
TINT = (0xE4, 0xF1, 0xEC)
WHITE = (0xFF, 0xFF, 0xFF)

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
IMAGES = os.path.join(ROOT, "assets", "images")
STORE = os.path.join(ROOT, "docs", "store-listing", "graphics")

# 안티에일리어싱을 위해 이 배율로 그린 뒤 축소한다.
# PIL 에 도형 안티에일리어싱이 없어서 이 방법을 쓴다.
SS = 4


def draw_mark(draw, box, color):
    """box=(x, y, size) 정사각 영역에 마크를 그린다. 좌표는 정규화 비율."""
    x0, y0, m = box

    def px(a, b):
        return (x0 + a * m, y0 + b * m)

    # 기준선. 막대보다 살짝 넓게 빼서 "차트" 로 읽히게 한다.
    draw.rounded_rectangle([px(0.0, 0.88), px(1.0, 0.95)],
                           radius=0.035 * m, fill=color)

    # 막대 3개. 높이 비율 1 : 0.675 : 0.35 로 잔액이 줄어드는 모양.
    # 위쪽 두 꼭지만 둥글게 하고 아래는 기준선에 딱 붙인다. 네 꼭지를 다
    # 둥글게 하면 가장 짧은 막대가 원처럼 보이고 막대가 기준선에서 떠 보인다.
    bar_w, gap, bottom = 0.22, 0.11, 0.885
    tops = [0.045, 0.305, 0.565]
    for i, top in enumerate(tops):
        left = 0.06 + i * (bar_w + gap)
        draw.rounded_rectangle([px(left, top), px(left + bar_w, bottom)],
                               radius=0.075 * m, fill=color,
                               corners=(True, True, False, False))


def render(size, *, bg=None, fg=WHITE, mark_ratio=0.56, path):
    """정사각 PNG 하나를 만든다. bg=None 이면 투명 배경."""
    n = size * SS
    img = Image.new("RGBA", (n, n), (bg + (255,)) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = n * mark_ratio
    draw_mark(d, ((n - m) / 2, (n - m) / 2, m), fg + (255,))
    img.resize((size, size), Image.LANCZOS).save(path)
    print("  %-38s %dx%d" % (os.path.relpath(path, ROOT).replace(os.sep, "/"),
                             size, size))


def render_feature_graphic(path, w=1024, h=500):
    """Play 그래픽 이미지.

    글자를 넣지 않는다. 언어별로 따로 올릴 수 있지만 하나만 만들어 여러 언어에
    공용으로 쓰기 때문이다. 언어별 그래픽을 만들려면 각 언어의 앱 이름을
    넣어야 하고, 그러면 CJK 폰트 3종을 챙겨야 해서 두부 현상 위험이 생긴다.
    """
    W, H = w * SS, h * SS

    # 아래로 갈수록 어두워지는 부드러운 세로 그라데이션.
    # 폴리곤을 겹쳐 쌓으면 사선 경계가 아티팩트로 보이므로 픽셀 행으로 만든다.
    img = Image.new("RGB", (1, H))
    for y in range(H):
        f = 1 - 0.22 * (y / H)
        img.putpixel((0, y), tuple(int(c * f) for c in BRAND))
    img = img.resize((W, H)).convert("RGBA")
    d = ImageDraw.Draw(img)

    # 마크는 왼쪽에. 아이콘과 같은 도형이라 스토어에서 같은 앱으로 읽힌다.
    m = H * 0.46
    draw_mark(d, (W * 0.10, (H - m) / 2, m), WHITE + (255,))

    # 오른쪽 장식은 앱의 핵심 기능을 보여주는 그림으로 교체할 것.
    # 아래는 loan-calculator 의 3방식 잔액 곡선 예시다.
    x1, x2 = W * 0.44, W * 0.90
    top, bot = H * 0.30, H * 0.70

    # ImageDraw 는 알파를 합성하지 않고 픽셀을 그대로 덮어쓴다. 반투명 요소를
    # 같은 레이어에 그리면 전부 불투명 흰색이 된다. 요소마다 레이어를 만들어
    # alpha_composite 로 얹는다.
    def overlay(fn):
        nonlocal img, d
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        fn(ImageDraw.Draw(layer))
        img = Image.alpha_composite(img, layer)
        d = ImageDraw.Draw(img)

    # 기준선. 곡선이 허공에 떠 보이지 않게 잡아 준다.
    overlay(lambda ld: ld.line([(x1, bot), (x2 + W * 0.02, bot)],
                               fill=WHITE + (55,), width=2 * SS))

    for alpha, width, curve in [
        # 만기일시: 기간 중 잔액이 그대로다. 만기의 수직 낙하는 그리지 않는다.
        # 그리면 다른 두 곡선과 삼각형을 이뤄 도형 오류처럼 보인다.
        (110, 5, lambda t: 1.0),
        # 원리금균등: 처음엔 느리게 줄다가 뒤에서 가팔라진다
        (170, 6, lambda t: 1 - t ** 2.1),
        # 원금균등: 직선으로 줄어든다
        (255, 8, lambda t: 1 - t),
    ]:
        pts = [(x1 + (x2 - x1) * (s / 120),
                bot - (bot - top) * curve(s / 120)) for s in range(121)]
        cx, cy, r = pts[-1][0], pts[-1][1], width * SS * 1.5

        def draw_curve(ld, pts=pts, alpha=alpha, width=width,
                       cx=cx, cy=cy, r=r):
            ld.line(pts, fill=WHITE + (alpha,), width=width * SS,
                    joint="curve")
            # 끝점에 점을 찍어 곡선 세 개가 각각 어디서 끝나는지 보이게 한다.
            ld.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE + (alpha,))

        overlay(draw_curve)

    img.convert("RGB").resize((w, h), Image.LANCZOS).save(path, quality=95)
    print("  %-38s %dx%d" % (os.path.relpath(path, ROOT).replace(os.sep, "/"),
                             w, h))


def main():
    os.makedirs(STORE, exist_ok=True)
    p = lambda *a: os.path.join(*a)

    print("assets/images (app.json 이 참조하는 것):")
    # 앱 아이콘 원본. 투명 배경을 쓰지 않는다 (Play 가 거부한다).
    render(1024, bg=BRAND, path=p(IMAGES, "icon.png"))
    # 적응형 아이콘. 배경은 단색, 전경은 브랜드 색 마크.
    # 마스킹으로 바깥 33% 가 잘릴 수 있으므로 마크를 안쪽 50% 에만 둔다.
    render(432, bg=TINT, fg=TINT, mark_ratio=0.0,
           path=p(IMAGES, "android-icon-background.png"))
    render(432, fg=BRAND, mark_ratio=0.50,
           path=p(IMAGES, "android-icon-foreground.png"))
    # 테마 아이콘. 시스템이 알파만 보고 색을 입히므로 검정으로 그린다.
    render(432, fg=(0, 0, 0), mark_ratio=0.50,
           path=p(IMAGES, "android-icon-monochrome.png"))
    # 스플래시. 배경이 진한 브랜드 색이라 흰 마크를 쓴다.
    # imageWidth 가 작으면 작게 렌더되므로 여백을 거의 두지 않는다.
    render(512, fg=WHITE, mark_ratio=0.92, path=p(IMAGES, "splash-icon.png"))
    render(48, bg=BRAND, mark_ratio=0.62, path=p(IMAGES, "favicon.png"))

    print("docs/store-listing/graphics (Play Console 에 직접 업로드):")
    render(512, bg=BRAND, path=p(STORE, "play-icon-512.png"))
    render_feature_graphic(p(STORE, "feature-graphic-1024x500.png"))


if __name__ == "__main__":
    main()
