# DE10-Lite Guide

Setup files and lab instructions for the **Terasic DE10-Lite** FPGA board with
**Quartus Prime Lite 25.1std** on Windows.

By **Elias Antoun** &mdash; Notre Dame University &ndash; Louaize.

### 👉 Students: use the guide

**<https://elias-antoun.github.io/de10-lite-setup/>**

The page fills every path in for your own Quartus installation, project folder
and project name, gives you a copy button on each one, and remembers which
steps you have finished. The text below is the same material, for reference.

---

## Setup — once per PC

1. Install [**Quartus Prime Lite 25.1std** for Windows](https://www.altera.com/downloads/fpga-development-tools/quartus-prime-lite-edition-design-software-version-25-1-windows).
   The Lite edition is free and needs no licence.

   **Tick MAX 10 FPGA in the device family list while installing.** Quartus
   installs quite happily without it and then cannot compile for the board at
   all; the DE10-Lite's chip is a MAX 10 (`10M50DAF484C7G`). If you already
   installed Quartus without it, **Tools ▸ Install Devices** adds a family to an
   existing installation — no need to start over. A different Quartus version
   works too, but its folder paths differ from the ones below.
2. Download the setup zip from [Releases](../../releases/latest) and extract it.
3. Copy `bin32` into your Quartus folder, next to the `bin64` already there —
   `C:\altera_lite\25.1std\quartus\bin32` by default. The Control Panel is a
   32-bit program and Quartus ships only 64-bit tools; `bin32` supplies the rest.
4. Copy the `Tools` folder to `C:\DE10_Lite\Tools`. Neither tool has an installer.
5. Plug the USB cable into the board's **USB-Blaster** port (`J3`, square type-B).
   The board is powered over USB. LED `D4` *Power Good* lights up.
6. Run `DE10_Lite_ControlPanel.exe` to confirm it all works.

## Lab workflow — once per project

### 1. Create the project in System Builder

Run `DE10_Lite_SystemBuilder.exe`. It generates a Quartus project with every
DE10-Lite pin pre-assigned, so you never assign pins by hand.

- **Project Name:** `adder_top` — this becomes the top-level entity name.
- **System Configuration:** tick **only** Switch ×10, LED ×10, 7-Segment ×6.
  Leave Button, VGA, SDRAM, Accelerometer and Arduino Header off. Note that
  **CLOCK is already ticked when the dialog opens** — untick it, since the adder
  is combinational and has no clock.
- **2x20 GPIO Header:** None. **Prefix Name:** blank.
- Click **Generate** and save to a folder **with no spaces in its path**,
  e.g. `C:\fpga\adder_top`.

You get `adder_top.qpf`, `.qsf` (pins), `.sdc`, `.htm` (pin table) and
`adder_top.v` — an empty wrapper with the ports declared.

### 2. Add the design

Open the generated `adder_top.v`, delete its contents, paste in the full
`adder_top.v` your instructor supplied (all four modules), and save. The file
name and module name must match the project name exactly.

### 3. Compile

Open `adder_top.qpf` in Quartus, then **Processing ▸ Start Compilation**. Wait
for *Full Compilation was successful*.

In **Compilation Report ▸ Flow Summary** expect a few dozen logic elements and
**Total pins = 68** (10 switches + 10 LEDs + 6×8 seven-segment lines). A
different pin count means a System Builder tick was wrong.

Clock and timing warnings are normal — this design has no clock. Output lands
at `output_files\adder_top.sof`.

### 4. Program the board

The [setup page](https://elias-antoun.github.io/de10-lite-setup/#lab) walks
this through with a screenshot of every dialog. In short — **Tools ▸ Programmer**, then:

1. **Hardware Setup…** → select `USB-Blaster [USB-0]` → **Close**. Mode: `JTAG`.
2. If the file list is empty, **Add File…** → your `.sof`. Device reads
   `10M50DAF484`; if asked to choose, pick `10M50DA`.
3. Tick **Program/Configure** → **Start**.

Progress reaches 100% and LED `D2` (`CONF_DONE`) turns on. A `.sof` is
**volatile** — it lives in the FPGA's RAM and is lost on power-off, which is
what you want while testing.

## Signals

Taken from the *DE10-Lite User Manual* (Terasic, 17 October 2022). Get these
backwards and the board does something baffling rather than nothing.

| Peripheral | Polarity |
| --- | --- |
| 7-segment displays | **Active LOW** — common anode, so `0` lights a segment |
| LEDs (`LEDR`) | **Active HIGH** — `1` lights the LED |
| Slide switches (`SW`) | Up = `1`, down (toward the board edge) = `0` |
| Push-buttons (`KEY`) | **Active LOW** — `0` while held; debounced in hardware |

**Segment bits.** Each `HEX` port is 8 bits wide:

| Bit | Segment | | Bit | Segment |
| --- | --- | --- | --- | --- |
| `[0]` | top | | `[4]` | lower left |
| `[1]` | upper right | | `[5]` | upper left |
| `[2]` | lower right | | `[6]` | middle |
| `[3]` | bottom | | `[7]` | decimal point |

So a `0` is every segment except the middle bar and the point — and since the
displays are active low, that is `8'hC0`. `HEX0` is the rightmost display,
`HEX5` the leftmost.

**Clocks** — not used by the adder, which is why CLOCK stays unticked and
Quartus warns about undefined clocks. Anything sequential needs one of these:

| Signal | Pin | Frequency |
| --- | --- | --- |
| `MAX10_CLK1_50` | `PIN_P11` | 50 MHz |
| `MAX10_CLK2_50` | `PIN_N14` | 50 MHz |
| `ADC_CLK_10` | `PIN_N5` | 10 MHz, feeds the ADC PLLs |

## Troubleshooting

**Windows does not recognise the board.** Device Manager → right-click
`USB-Blaster` → **Update driver** → **Browse my computer** → point at
`C:\altera_lite\25.1std\quartus\drivers\usb-blaster` with *Include subfolders*
ticked. Windows never finds this driver by itself; it ships with Quartus.

**Programmer or Control Panel cannot see the board.** Only one program can hold
the USB-Blaster at a time — close the other one. Check `bin32` sits beside
`bin64`. Try another port and another cable; charge-only cables have no data wires.

**My design disappears when I unplug the board.** Normal. A `.sof` programmed
over JTAG lives in the FPGA's configuration RAM and is gone at power-off. To
survive a power cycle the design must go into the configuration flash (CFM) as
a `.pof`, which needs a Dual Configuration IP and the Convert Programming Files
step — Chapter 6 of the Terasic manual covers it. For lab work, just re-program.

**Compilation fails, or Total pins ≠ 68.** If Quartus does not offer the MAX 10
family or the `10M50DAF484C7G` device at all, MAX 10 support was never installed
— add it with **Tools ▸ Install Devices**. Otherwise: the module name inside the
`.v` must match the project name exactly, including case. A wrong pin count means the
System Builder ticks were off. Check the path has no spaces.

## Credits

Written and maintained by **Elias Antoun**, Notre Dame University &ndash; Louaize.

Pin assignments, signal polarity and the board diagram (Figure 1-2) are taken
from the *DE10-Lite User Manual* (Terasic, 17 October 2022). The DE10-Lite
board, the Control Panel and the System Builder are made by
[Terasic](https://www.terasic.com.tw/); Quartus Prime and MAX 10 are Altera
products. Redistributed here for coursework only; all rights remain with their
owners.

© 2026 Elias Antoun.

---

<details>
<summary>Maintainer notes</summary>

**Updating the download.** The page's button points at
`releases/latest/download/DE10_Lite_Setup.zip`, which always resolves to the
newest release. To publish a new zip, draft a release and attach the file under
that exact name — the link never changes and old releases stay available.

**Editing the page.** Everything is in `index.html`: no build step, no
dependencies. `board.png` is the diagram. `.nojekyll` tells Pages to serve files
as-is rather than running them through Jekyll. Commit and Pages redeploys within
a minute.

**Reusing the page for another lab.** Nothing is hard-coded to the adder. A
student changes *Project name* at the top of the page and every path, filename
and instruction updates. The only adder-specific text is the expected pin count
of 68 in Lab step 3.

</details>
