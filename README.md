# DE10-Lite tools setup

Setup files and instructions for the **Terasic DE10-Lite** FPGA board with
**Quartus Prime Lite 25.1std** on Windows.

### 👉 Students: follow the setup page

**<https://elias-antoun.github.io/de10-lite-setup/>**

It walks you through the four steps, fills in the paths for your own Quartus
installation, and lets you copy each path with one click. The written version is
below if you prefer it.

---

## Before you start

- Install **Quartus Prime Lite 25.1std** with **MAX 10** device support. The
  DE10-Lite uses a MAX 10 FPGA (`10M50DAF484C7G`); without that device family
  installed, Quartus cannot compile for the board.
- Download the setup zip from the page above (or from
  [Releases](../../releases/latest)) and extract it. Right-click the zip and
  choose **Extract All** first — don't run anything from inside the zip.

The zip contains:

| Folder   | What it is                                                            |
| -------- | --------------------------------------------------------------------- |
| `bin32/` | 32-bit support libraries that the Control Panel needs                  |
| `Tools/` | `DE10_Lite_ControlPanel` and `DE10_Lite_SystemBuilder`                 |

## Setup

### 1. Copy `bin32` into Quartus

Copy the `bin32` folder from the zip into your Quartus folder, **next to the
`bin64` folder that is already there**:

```
C:\altera_lite\25.1std\quartus\bin32
```

That is the default install path for 25.1std. If you installed Quartus
somewhere else, put `bin32` in whichever folder already contains `bin64`.

> **Why:** the Control Panel is a 32-bit program, but Quartus only ships the
> 64-bit tools. `bin32` gives it the pieces it needs to reach the board.

### 2. Copy the DE10-Lite tools

Copy the `Tools` folder from the zip to:

```
C:\DE10_Lite\Tools
```

### 3. Connect the board

Plug the supplied USB cable into the board's **USB Blaster** port and into your
PC. The board is powered over USB, so it needs no separate supply.

### 4. Open the Control Panel

```
C:\DE10_Lite\Tools\DE10_Lite_ControlPanel\DE10_Lite_ControlPanel.exe
```

When it connects, it loads its own design onto the FPGA and replaces whatever
was there. That is expected — program your own design from Quartus again
afterwards.

To start a new Quartus project with the board's pin assignments already in
place, run the System Builder. It works without the board connected.

```
C:\DE10_Lite\Tools\DE10_Lite_SystemBuilder\DE10_Lite_SystemBuilder.exe
```

## Troubleshooting

**The Control Panel can't find the board**

1. Open Device Manager. If **USB-Blaster** has a yellow warning icon or appears
   as an unknown device, right-click it → **Update driver** → **Browse my
   computer for drivers**. Point it at the folder below and tick **Include
   subfolders**:

   ```
   C:\altera_lite\25.1std\quartus\drivers
   ```

2. Close the Quartus Programmer and anything else using the board, then reopen
   the Control Panel. Only one program can hold the USB-Blaster at a time.
3. Check that `bin32` sits in the same folder as `bin64` (step 1).
4. Try a different USB port or cable.

**I don't know where Quartus is installed**

In the Start menu, right-click **Quartus Prime** → **More** → **Open file
location**. Right-click the shortcut that appears and choose **Open file
location** again. You land in a folder ending in `\quartus\bin64`. Paste that
path into the box at the top of the setup page — it trims the
`\quartus\bin64` part for you.

## Credits

The DE10-Lite board, the Control Panel and the System Builder are made by
[Terasic](https://www.terasic.com.tw/). Quartus Prime is made by Altera. They
are redistributed here only to save students a download; all rights remain with
their owners.

---

<details>
<summary>Maintainer notes</summary>

**Updating the download.** The page's download button points at
`releases/latest/download/DE10_Lite_Setup.zip`, which always resolves to the
newest release. To publish a new zip, draft a new release and attach the file
using that exact name — the link on the page never changes, and older releases
stay available.

**Editing the page.** Everything lives in `index.html`: no build step, no
dependencies. Commit a change and GitHub Pages redeploys within a minute.
`.nojekyll` tells Pages to serve the file as-is rather than running it through
Jekyll.

</details>
