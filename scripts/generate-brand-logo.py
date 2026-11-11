"""Reconstruct the supplied cartoon parrot from a small set of editable shapes.

The silhouette is intentionally organic. Crown tips and feather scallops retain
their asymmetry; the eyes use native ellipses/circles and both feet reuse one
outline. This generator does not sample or trace the source bitmap.
"""

import argparse
import sys
from pathlib import Path


SIZE = 1254
OUTLINE_WIDTH = 28
COLORS = {
    "outline": "#07111f",
    "body": "#76c418",
    "face": "#fcf9f4",
    "eye": "#030506",
    "yellow": "#ffd509",
    "blue": "#0085d8",
    "beak": "#feeed8",
    "lower_beak": "#4d4f52",
    "feet": "#9c8377",
}

# A few long cubic segments describe the intended outline, not pixel noise.
# Smooth curve commands preserve shared tangents across the back and belly.
BODY = (
    "M402 149 C482 189 544 153 618 144 S867 133 948 274 "
    "C1019 346 1025 483 981 570 C1054 647 1098 726 1077 835 "
    "S891 1129 672 1129 C510 1129 391 1120 298 1048 "
    "C212 974 177 861 216 721 L253 555 "
    "C259 482 305 390 370 323 C331 329 307 308 305 283 "
    "C302 260 363 241 416 231 C391 216 376 183 389 158 "
    "C392 148 396 146 402 149 Z"
)
TAIL = (
    "M184 995 C144 1046 112 1086 121 1117 "
    "C129 1155 191 1164 349 1083 L278 1002 Z"
)
WING_EDGE = (
    "M316 539 C231 564 162 681 133 769 "
    "C110 836 112 900 133 938 C151 976 182 963 223 941 "
    "C191 980 180 1007 210 1026 C250 1056 330 1025 403 977 "
    "C510 900 575 725 523 614"
)
WING_YELLOW = (
    "M185 668 C205 716 251 704 294 672 C297 716 324 735 366 725 "
    "C416 716 488 664 523 614 L588 575 V740 "
    "C560 796 504 835 456 824 "
    "C433 820 419 805 415 786 C372 841 320 869 289 853 "
    "C261 840 257 815 266 776 C219 824 166 858 132 833 "
    "L92 810 L100 716 Z"
)
LOWER_BEAK = (
    "M759 431 C733 465 736 526 758 561 "
    "C778 598 810 616 842 608 C881 604 917 579 941 544 "
    "C911 486 844 443 759 431 Z"
)
UPPER_BEAK = (
    "M746 430 C735 398 749 351 777 314 C804 279 841 262 881 262 "
    "C958 262 1033 339 1052 453 C1065 527 1031 594 1002 616 "
    "C989 625 981 618 974 603 C940 536 899 491 832 477 "
    "C785 468 755 460 746 430 Z"
)
FOOT = (
    "M6 52 C14 17 46 0 91 0 C137 0 169 20 178 53 "
    "C185 79 169 96 146 96 C119 96 97 84 91 57 "
    "C84 84 62 96 37 96 C11 96 -4 78 6 52 Z"
)


def artwork(flat):
    def paint(name):
        return COLORS[name] if flat or name not in {"body", "yellow", "blue", "beak"} else f"url(#{name}-fill)"

    stroke = (
        f'stroke="{COLORS["outline"]}" stroke-width="{OUTLINE_WIDTH}" '
        'stroke-linecap="round" stroke-linejoin="round"'
    )
    gradients = "" if flat else """
  <linearGradient id="body-fill" gradientUnits="userSpaceOnUse" x1="400" y1="160" x2="860" y2="1100">
    <stop stop-color="#69b713"/><stop offset="1" stop-color="#7bc918"/>
  </linearGradient>
  <linearGradient id="yellow-fill" gradientUnits="userSpaceOnUse" x1="230" y1="640" x2="440" y2="860">
    <stop stop-color="#ffdd09"/><stop offset="1" stop-color="#ffd00a"/>
  </linearGradient>
  <linearGradient id="blue-fill" gradientUnits="userSpaceOnUse" x1="160" y1="780" x2="430" y2="1070">
    <stop stop-color="#008bdf"/><stop offset="1" stop-color="#007bce"/>
  </linearGradient>
  <linearGradient id="beak-fill" gradientUnits="userSpaceOnUse" x1="810" y1="300" x2="1050" y2="600">
    <stop stop-color="#fff1dd"/><stop offset="1" stop-color="#fdebd2"/>
  </linearGradient>"""
    definitions = (
        gradients
        + f'\n  <clipPath id="wing-clip"><path d="{WING_EDGE} Z"/></clipPath>'
        + f'\n  <path id="foot-shape" d="{FOOT}"/>'
    )
    body = f"""<g id="parrot">
  <path id="tail" d="{TAIL}" fill="{paint('blue')}" {stroke}/>
  <path id="body" d="{BODY}" fill="{paint('body')}" {stroke}/>
  <ellipse id="face" cx="650" cy="430" rx="214" ry="160" transform="rotate(-16 650 430)" fill="{paint('face')}"/>
  <g id="wing" clip-path="url(#wing-clip)">
    <path d="{WING_EDGE} Z" fill="{paint('body')}"/>
    <rect x="90" y="730" width="510" height="400" fill="{paint('blue')}"/>
    <path d="{WING_YELLOW}" fill="{paint('yellow')}"/>
  </g>
  <path id="wing-outline" d="{WING_EDGE}" fill="none" {stroke}/>
  <path id="lower-beak" d="{LOWER_BEAK}" fill="{paint('lower_beak')}" {stroke}/>
  <path id="upper-beak" d="{UPPER_BEAK}" fill="{paint('beak')}" {stroke}/>
  <ellipse id="eye" cx="640" cy="376" rx="52" ry="59" transform="rotate(-4 640 376)" fill="{paint('eye')}"/>
  <circle id="eye-highlight" cx="652.5" cy="354" r="17" fill="#fff"/>
  <g id="feet" fill="{paint('feet')}" {stroke}>
    <use href="#foot-shape" transform="translate(432 1072)"/>
    <use href="#foot-shape" transform="translate(754 1072) scale(.9 1)"/>
  </g>
</g>"""
    return body, definitions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill-dir", required=True, type=Path, help="Installed image-to-geometric-svg skill directory")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--flat", action="store_true", help="Inspect silhouettes with solid fills")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, str(args.skill_dir.resolve() / "scripts"))
    from svg_geometry import svg_document, write_svg

    body, definitions = artwork(args.flat)
    write_svg(args.output, svg_document(SIZE, SIZE, body, defs=definitions), overwrite=args.overwrite)
    print(args.output.resolve())


if __name__ == "__main__":
    main()
