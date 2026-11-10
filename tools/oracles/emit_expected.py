"""Emit tools/oracles/expected.json: every oracle quantity of DESIGN section 9.1 (71 rows) plus the
level-scenario tables (L03, L07, L15, L17, L19), unrounded, computed here from the inputs.

Run:  python3 -I tools/oracles/emit_expected.py

The physics follows ac_oracles.py, ps_oracles.py, director_check.py, review/recheck/*.py, lines.py/l07.py,
review/l17_catalogue.py and review/l19/l19_ce.py (same inputs, same formulas; refactored into functions).
The `printed` blocks are the numbers of DESIGN 9.1 as printed (strings parsed to floats), used only by
check_printed.py; no `values` entry is ever copied from them.
"""
import cmath, json, math, os, sys
import numpy as np, scipy
from scipy.integrate import solve_ivp  # noqa: F401  (kept for parity with ps_oracles)
from scipy.linalg import expm
from scipy.optimize import brentq, fsolve

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "review", "l19"))
from l19_ce import sim, coal, hyd  # noqa: E402  (review/l19/l19_ce.py supersedes designer l19.py, REVIEW E6)

D = math.degrees
S3 = math.sqrt(3)
ORACLES = {}


def _ulp(s):
    """half unit of the last printed digit, for a printed numeric string such as '0.5994', '1.04195e-3', '6336'."""
    s = s.strip()
    mant, _, exp = s.lower().partition("e")
    dp = len(mant.split(".")[1]) if "." in mant else 0
    return 0.5 * 10 ** (-dp) * (10 ** int(exp) if exp else 1)


def row(id_, title, source, inputs, vals, units, tol, kind, printed, tols=None, note=None):
    """vals: name -> float; printed: name -> str as printed in DESIGN 9.1; tols: name -> (tol, kind) overrides."""
    assert id_ not in ORACLES, id_
    for k, v in vals.items():
        assert math.isfinite(v), (id_, k, v)
    assert set(printed) <= set(vals), (id_, set(printed) - set(vals))
    assert set(units) == set(vals), (id_, set(units) ^ set(vals))
    r = {"title": title, "source": source, "inputs": inputs,
         "values": {k: float(v) for k, v in vals.items()}, "units": units,
         "tol": tol, "tolKind": kind,
         "printed": {k: float(v) for k, v in printed.items()},
         "printedHalfUlp": {k: _ulp(v) for k, v in printed.items()}}
    if tols:
        r["tols"] = {k: {"tol": t, "tolKind": kd} for k, (t, kd) in tols.items()}
    if note:
        r["note"] = note
    ORACLES[id_] = r


def U(**kw):  # units helper: U(I="A", P="W")
    return kw


AC = "NCERT XII ch 6-7 style (worker-solved; no exact example number attached yet)"
PS = "Saadat/Glover/Grainger-Stevenson/Kothari-Nagrath/GATE style (worker-solved; no exact example number)"
G = "GRID model oracle (model definition or derived check, director-computed)"
pi = math.pi

# ============================================================== AC
row("AC-01", "RMS in R", AC, dict(R=100, V=220, f=50),
    dict(I_A=220 / 100, P_W=220**2 / 100), U(I_A="A", P_W="W"), 1e-6, "rel", dict(I_A="2.200", P_W="484.0"))
row("AC-02", "Peak <-> rms", AC, dict(V_peak=300, I_rms=10),
    dict(Vrms_V=300 / math.sqrt(2), Ipeak_A=10 * math.sqrt(2)), U(Vrms_V="V", Ipeak_A="A"), 1e-4, "rel",
    dict(Vrms_V="212.1", Ipeak_A="14.14"))
XL = 2 * pi * 50 * 0.044
row("AC-03", "X_L", AC, dict(L=0.044, V=220, f=50), dict(XL_ohm=XL, I_A=220 / XL), U(XL_ohm="ohm", I_A="A"), 1e-4, "rel",
    dict(XL_ohm="13.82", I_A="15.92"))
XC = 1 / (2 * pi * 60 * 60e-6)
row("AC-04", "X_C", AC, dict(C=60e-6, V=110, f=60), dict(XC_ohm=XC, I_A=110 / XC), U(XC_ohm="ohm", I_A="A"), 1e-4, "rel",
    dict(XC_ohm="44.21", I_A="2.488"))
w = 2 * pi * 50
R5, L5, C5 = 3.0, 25.48e-3, 796e-6
Z5 = complex(R5, w * L5 - 1 / (w * C5))
inp5 = dict(R=R5, L=L5, C=C5, f=50)
row("AC-05", "LCR |Z|", AC, inp5, dict(Z_ohm=abs(Z5)), U(Z_ohm="ohm"), 2e-3, "rel", dict(Z_ohm="5.005"),
    note="textbook 5 ohm with rounded X")
row("AC-06", "LCR phase", AC, inp5, dict(phi_deg=D(cmath.phase(Z5))), U(phi_deg="deg"), 3e-3, "rel", dict(phi_deg="53.17"),
    note="positive = V leads I (current lags)")
I7 = 230 / abs(Z5)
row("AC-07", "LCR I, pf, P", AC, dict(inp5, V=230), dict(I_A=I7, pf=R5 / abs(Z5), P_W=I7 * I7 * R5),
    U(I_A="A", pf="", P_W="W"), 3e-3, "rel", dict(I_A="45.96", pf="0.5994", P_W="6336"))
Z8 = complex(100, -1 / (w * 20e-6))
row("AC-08", "RC phasor", AC, dict(R=100, C=20e-6, V=220, f=50),
    dict(Z_ohm=abs(Z8), lead_deg=-D(cmath.phase(Z8)), I_A=220 / abs(Z8), pf=100 / abs(Z8)),
    U(Z_ohm="ohm", lead_deg="deg", I_A="A", pf=""), 1e-4, "rel",
    dict(Z_ohm="187.96", lead_deg="57.86", I_A="1.170", pf="0.5320"), note="lead_deg > 0: I leads V")
L9, C9, R9 = 2.0, 32e-6, 10.0
w0 = 1 / math.sqrt(L9 * C9); Q9 = w0 * L9 / R9
inp9 = dict(L=L9, C=C9, R=R9)
row("AC-09", "Resonance", AC, inp9, dict(w0_rad_s=w0, f0_Hz=w0 / 2 / pi, Q=Q9), U(w0_rad_s="rad/s", f0_Hz="Hz", Q=""),
    1e-6, "rel", dict(w0_rad_s="125.0", f0_Hz="19.89", Q="25.00"))
row("AC-10", "Bandwidth", AC, inp9, dict(dw_rad_s=R9 / L9, df_Hz=R9 / L9 / 2 / pi), U(dw_rad_s="rad/s", df_Hz="Hz"), 1e-6, "rel",
    dict(dw_rad_s="5.000", df_Hz="0.7958"))
I11 = 220 / R9
row("AC-11", "Voltage magnification", AC, dict(inp9, V=220),
    dict(I_A=I11, VL_V=I11 * w0 * L9, VC_V=I11 / (w0 * C9)), U(I_A="A", VL_V="V", VC_V="V"), 1e-6, "rel",
    dict(I_A="22.00", VL_V="5500", VC_V="5500"))
XL12, XC12 = w * 0.08, 1 / (w * 60e-6)
row("AC-12", "Pure LC, wattless", AC, dict(L=0.08, C=60e-6, R=0, V=230, f=50),
    dict(XL_ohm=XL12, XC_ohm=XC12, I_A=230 / abs(XL12 - XC12), Iamp_A=230 * math.sqrt(2) / abs(XL12 - XC12), P_W=0.0),
    U(XL_ohm="ohm", XC_ohm="ohm", I_A="A", Iamp_A="A", P_W="W"), 1e-4, "rel",
    dict(XL_ohm="25.13", XC_ohm="53.05", I_A="8.238", Iamp_A="11.65", P_W="0"), note="capacitive: I leads V")
row("AC-13", "Transformer turns/currents", AC, dict(Vp=2300, Vs=230, Np=4000, P=50e3),
    dict(Ns=4000 * 230 / 2300, Is_A=50e3 / 230, Ip_A=50e3 / 2300), U(Ns="turns", Is_A="A", Ip_A="A"), 1e-4, "rel",
    dict(Ns="400", Is_A="217.4", Ip_A="21.74"))
row("AC-14", "Transformer efficiency", AC, dict(Vin=220, Iin=5, Vout=22, Iout=40), dict(eta_pct=22 * 40 / (220 * 5) * 100),
    U(eta_pct="%"), 1e-6, "rel", dict(eta_pct="80.00"))
Rl = 2 * 15 * 0.5
for i_, v_, tag in ((15, 4000, "low"), (16, 40000, "high")):
    I_ = 800e3 / v_
    row(f"AC-{i_}", f"Town line, {tag} V", AC, dict(P=800e3, R_loop=15, V=v_), dict(I_A=I_, loss_kW=I_ * I_ * Rl / 1e3),
        U(I_A="A", loss_kW="kW"), 1e-6, "rel",
        dict(I_A="200.0" if i_ == 15 else "20.00", loss_kW="600.0" if i_ == 15 else "6.000"),
        note="R_loop = 15 ohm: script uses 2 x 15 x 0.5")
e0 = 20 * 3e-2 * pi * 0.08**2 * 50
row("AC-17", "AC generator emf", AC, dict(N=20, r=0.08, B=0.030, omega=50, R=10),
    dict(e0_V=e0, I0_A=e0 / 10, Pavg_W=e0**2 / 20), U(e0_V="V", I0_A="A", Pavg_W="W"), 1e-3, "rel",
    dict(e0_V="0.6032", I0_A="0.06032", Pavg_W="0.01819"))
V18 = complex(120, 160)
row("AC-18", "RL phasor sum", AC, dict(VR=120, VL=160), dict(V_V=abs(V18), phi_deg=D(cmath.phase(V18))), U(V_V="V", phi_deg="deg"),
    1e-5, "rel", dict(V_V="200.0", phi_deg="53.13"))
row("AC-19", "Mutual inductance", AC, dict(M=1.5, dI=20, dt=0.5), dict(emf_V=1.5 * 20 / 0.5), U(emf_V="V"), 1e-6, "rel",
    dict(emf_V="60.00"))
w20 = 1 / math.sqrt(27e-3 * 30e-6)
row("AC-20", "LC frequency", AC, dict(L=27e-3, C=30e-6),
    dict(w_rad_s=w20, f_Hz=w20 / 2 / pi, T_ms=2 * pi / w20 * 1e3), U(w_rad_s="rad/s", f_Hz="Hz", T_ms="ms"), 1e-4, "rel",
    dict(w_rad_s="1111", f_Hz="176.8", T_ms="5.655"))
E21 = (6e-3) ** 2 / 2 / 30e-6
row("AC-21", "LC energy", AC, dict(L=27e-3, C=30e-6, q0=6e-3), dict(E_J=E21, Imax_A=math.sqrt(2 * E21 / 27e-3)),
    U(E_J="J", Imax_A="A"), 1e-6, "rel", dict(E_J="0.6000", Imax_A="6.667"))
row("AC-22", "Choke vs resistor", AC, dict(V=220, f=50, I=5),
    dict(Z_ohm=44.0, P_resistor_W=25 * 44.0, L_H=44.0 / (2 * pi * 50), P_choke_W=0.0),
    U(Z_ohm="ohm", P_resistor_W="W", L_H="H", P_choke_W="W"), 1e-4, "rel",
    dict(Z_ohm="44.00", P_resistor_W="1100", L_H="0.1401", P_choke_W="0"))

# ============================================================== PS
Zb = 132e3**2 / 100e6; Ib = 100e6 / (S3 * 132e3)
row("PS-01", "pu bases", PS, dict(Sbase_MVA=100, Vbase_kV=132, Z1_ohm=20, Z2_ohm=50),
    dict(Zb_ohm=Zb, Ib_A=Ib, z20_pu=20 / Zb, z50_pu=50 / Zb), U(Zb_ohm="ohm", Ib_A="A", z20_pu="pu", z50_pu="pu"), 1e-4, "rel",
    dict(Zb_ohm="174.2", Ib_A="437.4", z20_pu="0.1148", z50_pu="0.2870"))
row("PS-02", "Change of base", PS, dict(S1_MVA=30, V1_kV=13.8, x=0.15, S2_MVA=100, V2_kV=13.2),
    dict(x_pu=0.15 * (100 / 30) * (13.8 / 13.2) ** 2), U(x_pu="pu"), 1e-4, "rel", dict(x_pu="0.5465"))
Zl3 = (40 + 100j) / (138**2 / 100)
row("PS-03", "Impedance diagram", PS, dict(Sbase_MVA=100, zones_kV=[13.8, 138, 69]),
    dict(Xg_pu=0.20 * 100 / 30, Xt1_pu=0.10 * 100 / 50, line_r_pu=Zl3.real, line_x_pu=Zl3.imag, Xt2_pu=0.08 * 100 / 40),
    U(Xg_pu="pu", Xt1_pu="pu", line_r_pu="pu", line_x_pu="pu", Xt2_pu="pu"), 1e-4, "rel",
    dict(Xg_pu="0.6667", Xt1_pu="0.2000", line_r_pu="0.2100", line_x_pu="0.5251", Xt2_pu="0.2000"))
Zp = 30 * cmath.exp(1j * math.radians(30)); Iph = 400 / abs(Zp)
row("PS-04", "Delta load", PS, dict(VLL=400, Z_ohm=30, phi_deg=30),
    dict(Iph_A=Iph, IL_A=S3 * Iph, P_kW=3 * Iph**2 * Zp.real / 1e3, Q_kvar=3 * Iph**2 * Zp.imag / 1e3),
    U(Iph_A="A", IL_A="A", P_kW="kW", Q_kvar="kvar"), 1e-4, "rel",
    dict(Iph_A="13.33", IL_A="23.09", P_kW="13.86", Q_kvar="8.000"))
Qc = 500e3 * (math.tan(math.acos(.7)) - math.tan(math.acos(.95))); CY = Qc / (w * 440**2)
row("PS-05", "PF capacitor", PS, dict(P_kW=500, V=440, f=50, pf1=0.70, pf2=0.95),
    dict(Qc_kvar=Qc / 1e3, CY_uF=CY * 1e6, CD_uF=CY / 3 * 1e6), U(Qc_kvar="kvar", CY_uF="uF", CD_uF="uF"), 1e-3, "rel",
    dict(Qc_kvar="345.8", CY_uF="5685", CD_uF="1895"), note="C_Y per phase (star), C_D per phase (delta)")
# PS-06 short line
Z6 = 10 + 40j; Vrp = 132e3 / S3
Ir = 50e6 / (S3 * 132e3 * .8) * (.8 - .6j); Vs6 = Vrp + Z6 * Ir
Ploss6 = 3 * abs(Ir) ** 2 * Z6.real
VR6, EFF6, LOSS6 = (abs(Vs6) - Vrp) / Vrp * 100, 50e6 / (50e6 + Ploss6) * 100, Ploss6 / 1e6
in6 = dict(Z_ohm=[10, 40], P_MW=50, pf=0.8, V_kV=132)
row("PS-06", "Short line", PS, in6,
    dict(VS_LL_kV=S3 * abs(Vs6) / 1e3, delta_deg=D(cmath.phase(Vs6)), VR_pct=VR6, loss_MW=LOSS6, eta_pct=EFF6),
    U(VS_LL_kV="kV", delta_deg="deg", VR_pct="%", loss_MW="MW", eta_pct="%"), 1e-3, "rel",
    dict(VS_LL_kV="147.67", delta_deg="4.782", VR_pct="11.87", loss_MW="2.242", eta_pct="95.71"),
    note="delta > 0: sending end leads receiving end")
row("PS-11", "Line efficiency", PS, in6, dict(eta_pct=EFF6, loss_MW=LOSS6), U(eta_pct="%", loss_MW="MW"), 1e-3, "rel",
    dict(eta_pct="95.71", loss_MW="2.242"))
# PS-07 nominal pi
Z7 = 20 + 80j; Y7 = 5e-4j
A7 = 1 + Y7 * Z7 / 2; B7 = Z7
Vr7 = 132e3 / S3; Ir7 = 60e6 / (S3 * 132e3 * .85) * (.85 - 1j * math.sqrt(1 - .85**2)); Vs7 = A7 * Vr7 + B7 * Ir7
row("PS-07", "Nominal-pi ABCD", PS, dict(Z_ohm=[20, 80], Y_S=5e-4, P_MW=60, pf=0.85, V_kV=132),
    dict(A_re=A7.real, A_im=A7.imag, B_mag=abs(B7), B_deg=D(cmath.phase(B7)), VS_LL_kV=S3 * abs(Vs7) / 1e3,
         VR_pct=(abs(Vs7) / abs(A7) - Vr7) / Vr7 * 100),
    U(A_re="", A_im="", B_mag="ohm", B_deg="deg", VS_LL_kV="kV", VR_pct="%"), 1e-3, "rel",
    dict(A_re="0.9800", A_im="0.0050", B_mag="82.46", B_deg="75.96", VS_LL_kV="164.0", VR_pct="26.79"),
    note="VR = (|VS|/|A| - VR_fl)/VR_fl, i.e. no-load voltage vs full-load voltage")
# PS-08 long line
z8, y8, l8 = 0.1 + 0.5j, 3.3e-6j, 300
g8 = cmath.sqrt(z8 * y8); Zc8 = cmath.sqrt(z8 / y8); A8 = cmath.cosh(g8 * l8)
row("PS-08", "Long line, Ferranti", PS, dict(l_km=300, z_ohm_km=[0.1, 0.5], y_S_km=3.3e-6, VS_kV=220),
    dict(A_re=A8.real, A_im=A8.imag, Zc_mag=abs(Zc8), Zc_deg=D(cmath.phase(Zc8)), VR0_kV=220 / abs(A8),
         rise_pct=(220 / abs(A8) - 220) / 220 * 100),
    U(A_re="", A_im="", Zc_mag="ohm", Zc_deg="deg", VR0_kV="kV", rise_pct="%"), 1e-3, "rel",
    dict(A_re="0.92663", A_im="0.014485", Zc_mag="393.08", Zc_deg="-5.655", VR0_kV="237.39", rise_pct="7.905"),
    note="rise_pct = (VR0 - VS)/VS (rise relative to the sending voltage, as printed in the doc); negative Zc angle is the capacitive-line convention")
Zc9 = math.sqrt(1e-3 / 11e-9)
row("PS-09", "SIL", PS, dict(L_H_km=1e-3, C_F_km=11e-9),
    dict(Zc_ohm=Zc9, SIL400_MW=400e3**2 / Zc9 / 1e6, SIL220_MW=220e3**2 / Zc9 / 1e6), U(Zc_ohm="ohm", SIL400_MW="MW", SIL220_MW="MW"),
    1e-4, "rel", dict(Zc_ohm="301.5", SIL400_MW="530.7", SIL220_MW="160.5"))
v10 = {}
for v in (132e3, 220e3):
    I = 100e6 / (S3 * v); v10[v] = (I, 3 * I * I * 10 / 1e6)
row("PS-10", "Loss vs voltage", PS, dict(P_MW=100, pf=1, R_ohm_ph=10, V_kV=[132, 220]),
    dict(I132_A=v10[132e3][0], loss132_MW=v10[132e3][1], I220_A=v10[220e3][0], loss220_MW=v10[220e3][1]),
    U(I132_A="A", loss132_MW="MW", I220_A="A", loss220_MW="MW"), 1e-3, "rel",
    dict(I132_A="437.4", loss132_MW="5.739", I220_A="262.4", loss220_MW="2.066"))


def ybus(lines, n):
    Yb = np.zeros((n, n), complex)
    for i, j, zz, b in lines:
        i -= 1; j -= 1; ys = 1 / zz
        Yb[i, i] += ys + 1j * b / 2; Yb[j, j] += ys + 1j * b / 2; Yb[i, j] -= ys; Yb[j, i] -= ys
    return Yb


lines12 = [(1, 2, 0.02 + 0.06j, 0.06), (1, 3, 0.08 + 0.24j, 0.05), (2, 3, 0.06 + 0.18j, 0.04)]
Yb = ybus(lines12, 3)
v12, u12, p12 = {}, {}, {}
pr12 = dict(Y11=("6.25", "-18.695"), Y12=("-5", "15"), Y13=("-1.25", "3.75"), Y22=("6.6667", "-19.95"), Y23=("-1.6667", "5"),
            Y33=("2.9167", "-8.705"))
for nm, (i, j) in dict(Y11=(0, 0), Y12=(0, 1), Y13=(0, 2), Y22=(1, 1), Y23=(1, 2), Y33=(2, 2)).items():
    v12[nm + "_re"] = Yb[i, j].real; v12[nm + "_im"] = Yb[i, j].imag; u12[nm + "_re"] = u12[nm + "_im"] = "pu"
    p12[nm + "_re"], p12[nm + "_im"] = pr12[nm]
row("PS-12", "Y_bus with charging", PS, dict(lines=[[1, 2, [0.02, 0.06], 0.06], [1, 3, [0.08, 0.24], 0.05], [2, 3, [0.06, 0.18], 0.04]]),
    v12, u12, 1e-5, "abs", p12, note="B is the total line charging (B/2 at each end)")
# PS-13 2-bus
V1 = 1.0; Z13 = 0.05 + 0.15j; S13 = 0.8 + 0.4j
bq = 2 * (Z13.real * S13.real + Z13.imag * S13.imag) - V1**2; cq = abs(Z13) ** 2 * abs(S13) ** 2
xq = (-bq + math.sqrt(bq * bq - 4 * cq)) / 2
V2_13 = np.conj((xq + Z13 * np.conj(S13)) / V1); I13 = np.conj(S13 / V2_13)
loss13 = abs(I13) ** 2 * Z13; S1_13 = V1 * np.conj(I13)
row("PS-13", "2-bus analytic LF", PS, dict(V1=1.0, Z_pu=[0.05, 0.15], SL_pu=[0.8, 0.4]),
    dict(V2_mag=abs(V2_13), V2_deg=D(cmath.phase(V2_13)), loss_re=loss13.real, loss_im=loss13.imag, S1_re=S1_13.real, S1_im=S1_13.imag),
    U(V2_mag="pu", V2_deg="deg", loss_re="pu", loss_im="pu", S1_re="pu", S1_im="pu"), 1e-4, "rel",
    dict(V2_mag="0.87987", V2_deg="-6.526", loss_re="0.05167", loss_im="0.15501", S1_re="0.85167", S1_im="0.55501"))
# 3-bus LF
lf = [(1, 2, 0.02 + 0.04j, 0), (1, 3, 0.01 + 0.03j, 0), (2, 3, 0.0125 + 0.025j, 0)]
Yl = ybus(lf, 3)
Psch = np.array([0, -2.566, 2.0]); Qsch2 = -1.102
LF_IN = dict(Sbase_MVA=100, bus1="slack 1.05@0", bus2="PQ load 256.6+j110.2 MW/Mvar", bus3="PV Pg=200 MW |V|=1.05",
             lines_pu=[[1, 2, [0.02, 0.04]], [1, 3, [0.01, 0.03]], [2, 3, [0.0125, 0.025]]], charging=0)


def gs_step(V):
    V = V.copy()
    i = 1
    V[i] = (complex(Psch[i], -Qsch2) / np.conj(V[i]) - sum(Yl[i, k] * V[k] for k in range(3) if k != i)) / Yl[i, i]
    i = 2
    Q = -np.imag(np.conj(V[i]) * (Yl[i] @ V))
    vn = (complex(Psch[i], -Q) / np.conj(V[i]) - sum(Yl[i, k] * V[k] for k in range(3) if k != i)) / Yl[i, i]
    V[i] = 1.05 * vn / abs(vn)
    return V, Q


V0 = np.array([1.05 + 0j, 1 + 0j, 1.05 + 0j])
Vgs1, Q3gs = gs_step(V0)
row("PS-14", "GS iteration 1", PS, dict(LF_IN, start="flat", order="bus 2, then bus 3 using new V2; PV |V| rescaled to 1.05"),
    dict(V2_re=Vgs1[1].real, V2_im=Vgs1[1].imag, Q3_pu=Q3gs, V3_deg=D(cmath.phase(Vgs1[2]))),
    U(V2_re="pu", V2_im="pu", Q3_pu="pu", V3_deg="deg"), 1e-5, "abs",
    dict(V2_re="1.01331", V2_im="-0.03100", Q3_pu="0.71206", V3_deg="0.2433"))


def mis(x):
    th2, th3, v2 = x
    V = np.array([1.05, v2 * np.exp(1j * th2), 1.05 * np.exp(1j * th3)])
    S = V * np.conj(Yl @ V)
    return np.array([S[1].real - Psch[1], S[2].real - Psch[2], S[1].imag - Qsch2]), V, S


def nr(tolm=1e-6):
    """Newton-Raphson, central-difference Jacobian (h=1e-7); returns x, iterations (Newton updates until max mismatch < tolm)."""
    x = np.array([0, 0, 1.0])
    for it in range(30):
        f = mis(x)[0]
        if np.max(abs(f)) < tolm:
            break
        J = np.zeros((3, 3)); h = 1e-7
        for j in range(3):
            xp = x.copy(); xm = x.copy(); xp[j] += h; xm[j] -= h
            J[:, j] = (mis(xp)[0] - mis(xm)[0]) / (2 * h)
        x = x - np.linalg.solve(J, f)
    return x, it


_, nit = nr(1e-6)
x = nr(1e-14)[0]
f, Vn, Sn = mis(x)
assert nit <= 4, nit
row("PS-15", "NR converged", PS, dict(LF_IN, start="flat (1.05, 1.0, 1.05 pu; 0 rad)", mismatch_tol_pu=1e-6),
    dict(V2_pu=abs(Vn[1]), ang2_deg=D(cmath.phase(Vn[1])), V3_pu=abs(Vn[2]), V3_ang_deg=D(cmath.phase(Vn[2])),
         iterations=float(nit), iterations_max=4.0),
    U(V2_pu="pu", ang2_deg="deg", V3_pu="pu", V3_ang_deg="deg", iterations="count", iterations_max="count"), 1e-5, "abs",
    dict(V2_pu="1.01334", ang2_deg="-1.3772", V3_pu="1.05", V3_ang_deg="0.4751", iterations_max="4"),
    tols=dict(ang2_deg=(1e-3, "abs"), V3_ang_deg=(1e-3, "abs"), iterations=(0, "abs"), iterations_max=(0, "abs")),
    note="iterations = Newton updates until max P/Q mismatch < 1e-6 pu (reference); iterations_max = 4 is the doc's bound (constant, iterations <= iterations_max asserted)")
Sij = {}
for i, j, zz, b in lf:
    Iij = (Vn[i - 1] - Vn[j - 1]) / zz
    Sij[(i, j)] = (Vn[i - 1] * np.conj(Iij), Vn[j - 1] * np.conj(-Iij))
tot = sum(a + b for a, b in Sij.values()) * 100
row("PS-16", "NR flows and losses", PS, LF_IN,
    dict(slackP_MW=Sn[0].real * 100, slackQ_Mvar=Sn[0].imag * 100, Q3_Mvar=Sn[2].imag * 100,
         S12_MW=Sij[(1, 2)][0].real * 100, S12_Mvar=Sij[(1, 2)][0].imag * 100,
         S23_MW=Sij[(2, 3)][0].real * 100, S23_Mvar=Sij[(2, 3)][0].imag * 100,
         lossP_MW=tot.real, lossQ_Mvar=tot.imag),
    U(slackP_MW="MW", slackQ_Mvar="Mvar", Q3_Mvar="Mvar", S12_MW="MW", S12_Mvar="Mvar", S23_MW="MW", S23_Mvar="Mvar",
      lossP_MW="MW", lossQ_Mvar="Mvar"), 1e-4, "rel",
    dict(slackP_MW="62.565", slackQ_Mvar="61.290", Q3_Mvar="60.915", S12_MW="89.951", S12_Mvar="52.035", S23_MW="-168.608",
         S23_Mvar="-62.083", lossP_MW="5.965", lossQ_Mvar="12.005"),
    note="S_ij leaves bus i (measured at bus i end)")
# faults (base 100 MVA, line zone 138 kV, T X0=X1=0.10)
Zb138 = 138**2 / 100; Ib138 = 100 / (S3 * 138)
xl1, xl0 = 40 / Zb138, 120 / Zb138
Z1f = .15 + .10 + xl1; Z2f = .17 + .10 + xl1; Z0f = .10 + xl0
fin = dict(Sbase_MVA=100, Vline_kV=138, gen_X1=0.15, T_X=0.10, T_X0=0.10, line_X1_ohm=40)
If3 = 1 / Z1f
row("PS-17", "3-phase fault", PS, fin,
    dict(Z1_pu=Z1f, If_pu=If3, If_kA=If3 * Ib138, S_MVA=100 * If3), U(Z1_pu="pu", If_pu="pu", If_kA="kA", S_MVA="MVA"), 1e-4, "rel",
    dict(Z1_pu="0.4600", If_pu="2.1737", If_kA="0.9094", S_MVA="217.4"))
Ia = 3 / (Z0f + Z1f + Z2f)
fin2 = dict(fin, gen_X2=0.17, gen_X0=0.05, line_X0_ohm=120, note="gen X0 blocked by delta")
row("PS-18", "SLG fault", PS, fin2, dict(Z2_pu=Z2f, Z0_pu=Z0f, Ia_pu=Ia, Ia_kA=Ia * Ib138),
    U(Z2_pu="pu", Z0_pu="pu", Ia_pu="pu", Ia_kA="kA"), 1e-4, "rel",
    dict(Z2_pu="0.4800", Z0_pu="0.7301", Ia_pu="1.7962", Ia_kA="0.7515"))
Ibf = S3 / (Z1f + Z2f)
row("PS-19", "LL fault", PS, fin2, dict(Ib_pu=Ibf, Ib_kA=Ibf * Ib138), U(Ib_pu="pu", Ib_kA="kA"), 1e-4, "rel",
    dict(Ib_pu="1.8425", Ib_kA="0.7708"))
# ED
a = np.array([500, 400, 200.]); b = np.array([5.3, 5.5, 5.8]); c = np.array([.004, .006, .009])


def ed(Pd, pmin, pmax):
    lam = brentq(lambda l: np.clip((l - b) / (2 * c), pmin, pmax).sum() - Pd, 0, 50, xtol=1e-14, rtol=1e-15)
    return lam, np.clip((lam - b) / (2 * c), pmin, pmax)


big = np.full(3, 1e4)
lam20, P20 = ed(975, -big, big); cost20 = (a + b * P20 + c * P20**2).sum()
edin = dict(a=a.tolist(), b=b.tolist(), c=c.tolist())
row("PS-20", "ED, no limits", PS, dict(edin, D_MW=975),
    dict(lambda_usd_MWh=lam20, P1_MW=P20[0], P2_MW=P20[1], P3_MW=P20[2], cost_usd_h=cost20),
    U(lambda_usd_MWh="$/MWh", P1_MW="MW", P2_MW="MW", P3_MW="MW", cost_usd_h="$/h"), 1e-4, "rel",
    dict(lambda_usd_MWh="9.163", P1_MW="482.89", P2_MW="305.26", P3_MW="186.84", cost_usd_h="8228.03"))
lo_, hi_ = np.array([200, 150, 100.]), np.array([450, 350, 300.])
lam21, P21 = ed(1000, lo_, hi_); cost21 = (a + b * P21 + c * P21**2).sum()
row("PS-21", "ED, limits binding", PS, dict(edin, D_MW=1000, Pmin=lo_.tolist(), Pmax=hi_.tolist()),
    dict(lambda_usd_MWh=lam21, P1_MW=P21[0], P2_MW=P21[1], P3_MW=P21[2], cost_usd_h=cost21),
    U(lambda_usd_MWh="$/MWh", P1_MW="MW", P2_MW="MW", P3_MW="MW", cost_usd_h="$/h"), 1e-4, "rel",
    dict(lambda_usd_MWh="9.580", P1_MW="450", P2_MW="340", P3_MW="210", cost_usd_h="8473.5"),
    note="lambda from bisection on total P with P_i clipped to [Pmin, Pmax]; unit 1 binds at its 450 MW maximum, units 2 and 3 are interior")
a2 = np.array([300, 250.]); b2 = np.array([8.0, 9.0]); c2 = np.array([0.004, 0.005])
B11, B12, B22 = 1e-4, -2e-5, 1.5e-4


def eqs(v):
    p1, p2, lam = v
    pl = B11 * p1**2 + 2 * B12 * p1 * p2 + B22 * p2**2
    dl1 = 2 * B11 * p1 + 2 * B12 * p2; dl2 = 2 * B12 * p1 + 2 * B22 * p2
    return [b2[0] + 2 * c2[0] * p1 - lam * (1 - dl1), b2[1] + 2 * c2[1] * p2 - lam * (1 - dl2), p1 + p2 - 300 - pl]


p1, p2, lam22 = fsolve(eqs, [150, 150, 10], xtol=1e-12)
PL22 = B11 * p1**2 + 2 * B12 * p1 * p2 + B22 * p2**2
row("PS-22", "ED with B-losses", PS, dict(a=a2.tolist(), b=b2.tolist(), c=c2.tolist(), B11=B11, B12=B12, B22=B22, D_MW=300),
    dict(P1_MW=p1, P2_MW=p2, lambda_usd_MWh=lam22, PL_MW=PL22), U(P1_MW="MW", P2_MW="MW", lambda_usd_MWh="$/MWh", PL_MW="MW"),
    1e-4, "rel", dict(P1_MW="213.67", P2_MW="91.365", lambda_usd_MWh="10.104", PL_MW="5.0368"),
    note="B coefficients in 1/MW; coordination equations dC/dP = lambda (1 - dPL/dP)")
row("PS-23", "Swing / RoCoF", PS, dict(S_MVA=500, H_s=5, f0=60, dP_pu=0.2),
    dict(KE_MJ=5 * 500, rocof_Hz_s=0.2 * 60 / (2 * 5)), U(KE_MJ="MJ", rocof_Hz_s="Hz/s"), 1e-4, "rel",
    dict(KE_MJ="2500", rocof_Hz_s="1.200"), note="rocof magnitude; sign negative for generation loss")
Pm, Pmax, H24, f24 = .8, 1.8, 5.0, 60.0
d0 = math.asin(Pm / Pmax); dm = pi - d0
dcr = math.acos((Pm * (dm - d0) + Pmax * math.cos(dm)) / Pmax)
tcr = math.sqrt(2 * H24 * (dcr - d0) / (pi * f24 * Pm))


def cct_rk4(dt):
    k = 2 * pi * f24 / (2 * H24)

    def fn(x, w_, fault):
        return w_, k * (Pm - (0 if fault else Pmax * math.sin(x)))

    def stable(tc):
        x_, w_, t = d0, 0.0, 0.0
        while t < 4:
            fault = t < tc - 1e-12
            h = min(dt, tc - t) if fault and tc - t > 1e-12 else dt
            a_ = fn(x_, w_, fault); b_ = fn(x_ + h / 2 * a_[0], w_ + h / 2 * a_[1], fault)
            c_ = fn(x_ + h / 2 * b_[0], w_ + h / 2 * b_[1], fault); e_ = fn(x_ + h * c_[0], w_ + h * c_[1], fault)
            x_ += h / 6 * (a_[0] + 2 * b_[0] + 2 * c_[0] + e_[0]); w_ += h / 6 * (a_[1] + 2 * b_[1] + 2 * c_[1] + e_[1]); t += h
            if x_ > pi + 0.5: return False
            if w_ < 0 and not fault: return True
        return True

    lo, hi = .2, .4
    for _ in range(40):
        m = (lo + hi) / 2
        if stable(m): lo = m
        else: hi = m
    return lo


row("PS-24", "Equal-area CCT", PS, dict(Pm_pu=0.8, Pmax_pu=1.8, fault="terminal 3-phase (Pe=0)", H_s=5, f0=60),
    dict(delta0_deg=D(d0), delta_cr_deg=D(dcr), t_cr_s=tcr, t_cr_rk4_s=cct_rk4(1e-4), t_cr_rk4_1ms_s=cct_rk4(1e-3)),
    U(delta0_deg="deg", delta_cr_deg="deg", t_cr_s="s", t_cr_rk4_s="s", t_cr_rk4_1ms_s="s"), 1e-3, "rel",
    dict(delta0_deg="26.39", delta_cr_deg="84.77", t_cr_s="0.2600", t_cr_rk4_s="0.25996"),
    note="t_cr_rk4_s: RK4 dt=0.1 ms with the step snapped to the clearing instant, bisection, stable if omega<0 after clearing before delta>pi+0.5 (recheck/ps24.py); _1ms_ the same at the engine's dt=1 ms")
row("PS-25", "Droop delta f", PS, dict(R_pu=0.05, D=0.8, dP_pu=0.01, f0=50), dict(df_Hz=-0.01 / (1 / 0.05 + 0.8) * 50), U(df_Hz="Hz"),
    1e-4, "rel", dict(df_Hz="-0.02404"))
R1, R2 = .04 * 50 / 500, .05 * 50 / 300
dfp = -100 / (1 / R1 + 1 / R2)
row("PS-26", "Droop sharing", PS, dict(G1="500 MVA 4%", G2="300 MVA 5%", dP_MW=100, D=0, f0=50),
    dict(df_Hz=dfp, P1_MW=-dfp / R1, P2_MW=-dfp / R2), U(df_Hz="Hz", P1_MW="MW", P2_MW="MW"), 1e-4, "rel",
    dict(df_Hz="-0.2703", P1_MW="67.57", P2_MW="32.43"), note="R_i in Hz/MW = R_pu*f0/S_i")
E27 = 1 + 1j * 1.2 * (0.8 - 0.6j)
row("PS-27", "Excitation emf", PS, dict(Vt=1, I=1, pf=0.8, Xs=1.2), dict(E_pu=abs(E27), delta_deg=D(cmath.phase(E27))),
    U(E_pu="pu", delta_deg="deg"), 1e-4, "rel", dict(E_pu="1.9698", delta_deg="29.17"))
row("PS-28", "Max power", PS, dict(E=abs(E27), V=1, X=1.2),
    dict(Pmax_pu=abs(E27) / 1.2, P_at_delta_pu=abs(E27) * math.sin(cmath.phase(E27)) / 1.2), U(Pmax_pu="pu", P_at_delta_pu="pu"),
    1e-4, "rel", dict(Pmax_pu="1.6415", P_at_delta_pu="0.8000"), note="E taken unrounded from PS-27")

# ============================================================== G
rho = 1.724e-8
Rc1 = rho * 600 / 2.5e-6; I1 = 48 / (Rc1 + 4.8)
row("G-01", "Resistance formula", G, dict(rho=rho, A_mm2=2.5, length_m="2 x 300", V=48, Rload=4.8),
    dict(Rc_ohm=Rc1, I_A=I1, Vload_V=I1 * 4.8), U(Rc_ohm="ohm", I_A="A", Vload_V="V"), 1e-3, "rel",
    dict(Rc_ohm="4.138", I_A="5.371", Vload_V="25.78"))
Rc1b = 7.41 * 0.6; I1b = 48 / (Rc1b + 4.8)
row("G-01b", "L01 naive (catalogue path)", G, dict(R_ohm_km=7.41, length_m="2 x 300", V=48, Rload=4.8),
    dict(Rc_ohm=Rc1b, I_A=I1b, Vload_V=I1b * 4.8, loss_pct=100 * (1 - I1b * 4.8 / 48)), U(Rc_ohm="ohm", I_A="A", Vload_V="V", loss_pct="%"),
    1e-3, "rel", dict(Rc_ohm="4.446", I_A="5.191", Vload_V="24.92", loss_pct="48.1"),
    note="loss_pct = voltage drop % of the source voltage (= cable loss share of source power)")
g2 = {}
for tag, rk, l in (("25mm", .727, .3), ("10mm", 1.83, .12)):
    Rc = rk * 2 * l; I = 48 / (Rc + 4.8); g2["V_" + tag] = I * 4.8; g2["loss_pct_" + tag] = 100 * (1 - I * 4.8 / 48)
row("G-02", "L01 lesson builds", G, dict(builds=[dict(A_mm2=25, R_ohm_km=0.727, length_m=300), dict(A_mm2=10, R_ohm_km=1.83, length_m=120)], V=48, Rload=4.8),
    g2, U(V_25mm="V", loss_pct_25mm="%", V_10mm="V", loss_pct_10mm="%"), 1e-3, "rel",
    dict(V_25mm="44.00", loss_pct_25mm="8.33", V_10mm="43.98", loss_pct_10mm="8.38"), note="loss_pct = voltage-drop % of source")
hr = math.sqrt(50 / 2)  # sqrt(Ssc/Qc) = sqrt(50 MVA / 2 MVAr)
row("G-03", "Parallel resonance order", G, dict(V_kV=11, Ssc_MVA=50, Qc_MVAr=2, f0=50), dict(hr=hr, fr_Hz=50 * hr), U(hr="", fr_Hz="Hz"),
    1e-6, "rel", dict(hr="5.000", fr_Hz="250.0"))
row("G-04", "Detuned bank", G, dict(V_kV=11, Ssc_MVA=50, Qc_MVAr=2, reactor=0.07),
    dict(h_series=1 / math.sqrt(.07), h_parallel=math.sqrt(1 / (2 / 50 + .07)), Qeff_MVAr=2 / (1 - .07)),
    U(h_series="", h_parallel="", Qeff_MVAr="MVAr"), 1e-4, "rel", dict(h_series="3.780", h_parallel="3.015", Qeff_MVAr="2.1505"),
    note="Qc = capacitor's own rating V^2/Xc; Qeff = Qc/(1-0.07)")
a120 = cmath.exp(2j * pi / 3)
IN = 10 + 6 * a120**-1 + 4 * a120
row("G-05", "Neutral current", G, dict(Ia="10@0", Ib="6@-120", Ic="4@120"), dict(IN_mag=abs(IN), IN_deg=D(cmath.phase(IN))),
    U(IN_mag="A", IN_deg="deg"), 1e-4, "rel", dict(IN_mag="5.2915", IN_deg="-19.11"), note="IN = Ia+Ib+Ic")
tS = lambda tms, M, k=0.14, al=0.02: tms * k / (M**al - 1)
t6 = tS(0.1, 10)
row("G-06", "IDMT SI", G, dict(TMS=0.1, M=10), dict(t_s=t6), U(t_s="s"), 1e-4, "rel", dict(t_s="0.2971"))
row("G-07", "Grading", G, dict(t_down_s="unrounded G-06", Is_up=600, I_fault=4000, CTI=0.3),
    dict(TMS2=(t6 + 0.3) * ((4000 / 600) ** 0.02 - 1) / 0.14, t_VI_s=tS(0.1, 10, 13.5, 1), t_EI_s=tS(0.1, 10, 80, 2)),
    U(TMS2="", t_VI_s="s", t_EI_s="s"), 1e-3, "rel", dict(TMS2="0.1649", t_VI_s="0.1500", t_EI_s="0.0808"),
    note="TMS2 from the unrounded downstream time")
row("G-08", "Wind curve", G, dict(P_MW=3, v_in=3, v_rated=12, v_out=25, v=8), dict(P_MW=3 * (8**3 - 27) / (12**3 - 27)), U(P_MW="MW"),
    1e-4, "rel", dict(P_MW="0.8554"))
row("G-09", "BESS SoC", G, dict(eta_rt=0.86, P_MW=50, hours=1), dict(dSoC_MWh=50 / math.sqrt(.86)), U(dSoC_MWh="MWh"), 1e-5, "rel",
    dict(dSoC_MWh="53.916"), note="eta_one_way = sqrt(eta_rt)")
row("G-10", "P-V nose", G, dict(V1=1, X_pu=0.15, pf=1), dict(Pmax_pu=1 / (2 * .15), Vnose_pu=1 / math.sqrt(2)), U(Pmax_pu="pu", Vnose_pu="pu"),
    1e-4, "rel", dict(Pmax_pu="3.3333", Vnose_pu="0.7071"))
beta11 = 2 * pi * 50 * math.sqrt(1e-3 * 11e-9)
row("G-11", "Lossless Ferranti", G, dict(L_H_km=1e-3, C_F_km=11e-9, l_km=300, f=50),
    dict(beta_rad_km=beta11, rise_pct=(1 / math.cos(beta11 * 300) - 1) * 100), U(beta_rad_km="rad/km", rise_pct="%"), 1e-4, "rel",
    dict(beta_rad_km="1.04195e-3", rise_pct="5.093"))
# G-12
H, Dd, Rr, Tg, dPL = 5.0, 1.0, 0.05, 0.5, 0.1
A12 = np.array([[-Dd / (2 * H), 1 / (2 * H)], [-1 / (Rr * Tg), -1 / Tg]]); B12v = np.array([-dPL / (2 * H), 0])
xa = lambda t: np.linalg.solve(A12, (expm(A12 * t) - np.eye(2)) @ B12v)


def rk4_traj(T, dt=0.01):
    x_ = np.zeros(2); out = [x_.copy()]; f_ = lambda s: A12 @ s + B12v
    for _ in range(int(round(T / dt))):
        k1 = f_(x_); k2 = f_(x_ + dt / 2 * k1); k3 = f_(x_ + dt / 2 * k2); k4 = f_(x_ + dt * k3)
        x_ = x_ + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4); out.append(x_.copy())
    return np.array(out)


tr = rk4_traj(30.0)
err = max(abs(tr[int(round(t / .01))][0] * 50 - xa(t)[0] * 50) for t in range(0, 31))
# analytic nadir: root of d(dw)/dt = 0
dwdt = lambda t: (A12 @ xa(t) + B12v)[0]
tn = brentq(dwdt, 0.5, 2.0, xtol=1e-14)
row("G-12", "Frequency response vs analytic", G, dict(H=5, D=1, R=0.05, TG_s=0.5, dPL_pu=0.1, f0=50, model="first-order governor, no deadband"),
    dict(df_1s_Hz=xa(1)[0] * 50, nadir_Hz=xa(tn)[0] * 50, t_nadir_s=tn, df_ss_Hz=-dPL / (Dd + 1 / Rr) * 50, rocof0_Hz_s=-dPL / (2 * H) * 50,
         rk4_df_1s_Hz=tr[100][0] * 50, rk4_max_abs_err_Hz=err),
    U(df_1s_Hz="Hz", nadir_Hz="Hz", t_nadir_s="s", df_ss_Hz="Hz", rocof0_Hz_s="Hz/s", rk4_df_1s_Hz="Hz", rk4_max_abs_err_Hz="Hz"),
    1e-5, "abs", dict(df_1s_Hz="-0.302584", nadir_Hz="-0.30752", t_nadir_s="1.174", df_ss_Hz="-0.238095", rocof0_Hz_s="-0.5000"),
    note="analytic = matrix exponential; rk4_* = RK4 dt 10 ms; rk4_max_abs_err_Hz = max |RK4 - analytic| on integer seconds 0..30 (doc: <= 1e-6)")
row("G-13", "Hydro inverse response", G, dict(Tw_s=2, form="(1 - Tw s)/(1 + 0.5 Tw s), unit step"),
    dict(y0plus=-2.0, y_1s=1 - 3 * math.exp(-1 / (0.5 * 2))), U(y0plus="", y_1s=""), 1e-5, "abs", dict(y0plus="-2", y_1s="-0.10364"))
row("G-14", "PV model", G, dict(Pdc_MW=100, G=800, Tcell=45, gamma_per_C=-0.004), dict(Pdc_MW=100 * 0.8 * (1 - 0.004 * 20)), U(Pdc_MW="MW"),
    1e-6, "rel", dict(Pdc_MW="73.60"), note="STC 1000 W/m2, 25 C")
row("G-15", "THD", G, dict(V5=0.04, V7=0.03), dict(THD_pct=100 * math.sqrt(.04**2 + .03**2)), U(THD_pct="%"), 1e-6, "rel", dict(THD_pct="5.000"))
row("G-16", "Marginal fuel cost", G, dict(HR_MJ_kWh=10.3, price_usd_GJ=2.60, price_inr_GJ=220),
    dict(cost_usd_MWh=10.3 * 2.6, cost_inr_MWh=10.3 * 220), U(cost_usd_MWh="$/MWh", cost_inr_MWh="INR/MWh"), 1e-6, "rel",
    dict(cost_usd_MWh="26.78", cost_inr_MWh="2266"))


def g17(tau):
    yt = 1 / 0.1j
    Yt = np.array([[yt / tau**2, -yt / tau], [-yt / tau, yt]])

    def F(v):
        th, vm = v; Vv = np.array([1.0, vm * np.exp(1j * th)]); S = Vv * np.conj(Yt @ Vv); return [S[1].real + .5, S[1].imag + .2]

    s = fsolve(F, [0, 1], xtol=1e-12)
    return s[1], D(s[0])


v105, a105 = g17(1.05); v100, a100 = g17(1.0)
row("G-17", "Tap convention", G, dict(V1=1, xt=0.1, load_pu=[0.5, 0.2], tau=[1.05, 1.00], tap_side="bus 1 (ideal tap), xt on bus 2 side; Y=[[y/t^2,-y/t],[-y/t,y]]"),
    dict(V2_tau105=v105, V2_tau100=v100, V2ang_deg_tau105=a105, V2ang_deg_tau100=a100),
    U(V2_tau105="pu", V2_tau100="pu", V2ang_deg_tau105="deg", V2ang_deg_tau100="deg"), 1e-4, "rel",
    dict(V2_tau105="0.92934", V2_tau100="0.97825"))
row("G-18", "Parallel sources", G, dict(sources=2, x_pu=0.2), dict(If_pu=1 / (0.2 * 0.2 / 0.4)), U(If_pu="pu"), 1e-9, "rel", dict(If_pu="10.00"))
row("G-19", "f = pN/120", G, dict(case1="4-pole 1500 rpm", case2="24-pole hydro 50 Hz"), dict(f_Hz=4 * 1500 / 120, N_rpm=120 * 50 / 24),
    U(f_Hz="Hz", N_rpm="rpm"), 0, "rel", dict(f_Hz="50.0", N_rpm="250.0"))
row("G-20", "Balanced phasors", G, dict(expr="1 + a + a^2"), dict(sum_mag=abs(1 + a120 + a120**2)), U(sum_mag=""), 1e-12, "abs", dict(sum_mag="0"))

# ============================================================== LEVELS
LEVELS = {}
# ---- L03: exact constant-power solve
P_far = 5000 / 0.97; Vs = 380.0
L03 = dict(inputs=dict(P_load_W=5000, converter_eta=0.97, P_far_W=P_far, V_send=Vs, loop_km=2.0,
                       R_ohm_km_20C={"25": 0.727, "35": 0.524, "50": 0.387}, source="IEC 60228 class 2 copper max R20 (DESIGN 4.2)",
                       loss_def="line I^2R / P_far (power delivered at the far end of the line)"), cables={})
for mm, rk in (("25", .727), ("35", .524), ("50", .387)):
    R_ = rk * 2; I_ = (Vs - math.sqrt(Vs * Vs - 4 * R_ * P_far)) / (2 * R_); Vf = Vs - I_ * R_
    L03["cables"][mm + "mm2"] = dict(R_loop_ohm=R_, I_A=I_, V_far_V=Vf, loss_W=I_ * I_ * R_, loss_pct_exact=I_ * I_ * R_ / P_far * 100,
                                     loss_pct_naive=(5000 / Vs) ** 2 * R_ / 5000 * 100,  # (P/V)^2 R / P, P = 5 kW at 380 V: the doc's 5.03/3.63/2.68
                                     loss_pct_naive_Pfar=(P_far / Vs) ** 2 * R_ / P_far * 100)
LEVELS["L03"] = L03
# ---- L07
Vb = 11e3; zl = 4 * (1.1255 + .377j)
SL = 1.2e6 * (1 + 1j * math.tan(math.acos(.7))) + .5e6 * (1 + 1j * math.tan(math.acos(.95)))


def l07(Qc, v2):
    Vsp = 1.03 * Vb / S3; V = Vsp
    for _ in range(2000):
        Sc = SL - 1j * Qc * (abs(V) / (Vb / S3)) ** 2 if v2 else SL - 1j * Qc
        Iv = np.conj(Sc / (3 * V)); Vn = Vsp - zl * Iv
        if abs(Vn - V) < 1e-12: V = Vn; break
        V = Vn
    return abs(Iv), abs(V) * S3 / Vb, 3 * abs(Iv) ** 2 * zl.real / 1e3


i0, v0, l0 = l07(0, True); i9, v9, l9 = l07(0.9e6, True); i9c, v9c, _ = l07(0.9e6, False)
LEVELS["L07"] = dict(inputs=dict(feeder="4 km l11-weasel r 1.1255 x 0.377 ohm/km, rating 115 A", Vs_pu=1.03, Vbase_kV=11,
                                 mill="1.2 MW pf 0.70 lag", village="0.5 MW pf 0.95 lag", cap_at="mill bus (far end)",
                                 constant_PQ_load="yes (P,Q fixed); capacitor Q = Qc*(V/Vnom)^2"),
                     nocap=dict(I_A=i0, V_pu=v0, loss_kW=l0, loading=i0 / 115),
                     cap900=dict(I_A=i9, V_pu=v9, loading=i9 / 115),
                     cap900_constQ=dict(I_A=i9c, V_pu=v9c, note="not the oracle: Q independent of V, for comparison only"),
                     Qc_rule_MVAr=1.2 * (math.tan(math.acos(.7)) - math.tan(math.acos(.95))))
# ---- L15
l15, z15, y15 = 350, .0347 + .327j, 3.43e-6j
g15 = cmath.sqrt(z15 * y15); Zc15 = cmath.sqrt(z15 / y15); A15 = cmath.cosh(g15 * l15); C15 = cmath.sinh(g15 * l15) / Zc15
Vsp = 400e3 / S3; Is15 = C15 * (Vsp / A15); Ss15 = 3 * Vsp * np.conj(Is15)
LEVELS["L15"] = dict(inputs=dict(line="l400-twinmoose r 0.0347 x 0.327 ohm/km b 3.43 uS/km, 350 km, exact pi, VS = 400 kV LL"),
                     A_mag=abs(A15), A_re=A15.real, A_im=A15.imag, VR0_kV=400 / abs(A15), rise_pct=(400 / abs(A15) / 400 - 1) * 100,
                     Qnominal_MVAr=3.43e-6 * l15 * 400**2, Qs_charging_exact_MVAr=-Ss15.imag / 1e6, Ps_noload_MW=Ss15.real / 1e6,
                     note="Qs_charging = -Im(Ss) at no load (sending end absorbs negative Q = delivers charging)")


# ---- L17
def l17_line(r, x, b, l, n):
    z = complex(r, x); y = complex(0, b); g = cmath.sqrt(z * y); Zc = cmath.sqrt(z / y); Zb_ = 220**2 / 100
    return Zc * cmath.sinh(g * l) / Zb_ / n, cmath.tanh(g * l / 2) / Zc * Zb_ * n


def l17_solve(P, n, qfun, guess, xs=0.02, pf=0.92, r=0.0418, x=0.302, b=3.72e-6, l=150):
    Zs, Ysh = l17_line(r, x, b, l, n); tan = math.tan(math.acos(pf))

    def F(u):
        V2 = u[0] * cmath.exp(1j * u[1]); I = (1.0 - V2) / (Zs + 1j * xs)
        Sin = V2 * np.conj(I) - V2 * np.conj(V2 * Ysh); Sl = complex(P, P * tan) - 1j * qfun(abs(V2))
        return [(Sin - Sl).real, (Sin - Sl).imag]

    u, _, ier, _ = fsolve(F, guess, full_output=True, xtol=1e-13)
    return (u if ier == 1 and u[0] >= 0.3 else None)


def l17_max(n, qfun, step=0.02):
    """reviewer grid (2 MW) as in l17_catalogue.py, then continuation to ~1e-4 MW by bisection from the last upper-branch point."""
    best, g = 0.0, [1.0, -0.2]
    for P in np.arange(0.1, 15, step):
        u = l17_solve(P, n, qfun, g)
        if u is None: break
        best, g = P, list(u)
    lo, hi = best, best + step
    for _ in range(40):
        m = (lo + hi) / 2; u = l17_solve(m, n, qfun, g)
        if u is None: hi = m
        else: lo = m
    return best * 100, lo * 100


l17 = dict(inputs=dict(line="l220-twinzebra r 0.0418 x 0.302 ohm/km b 3.72 uS/km, 150 km, exact pi, n circuits", ring_Xs_pu=0.02,
                       Sbase_MVA=100, pf=0.92, STATCOM="constant current: Q = Imax*|V|; caps: Q = Qc*|V|^2",
                       note="Pmax_grid_MW = reviewer 2 MW grid (the doc's integers); Pmax_MW = refined nose by bisection on solvability"))
for key, n, qf in (("none_N1", 1, lambda v: 0.0), ("caps80_N1", 1, lambda v: 0.8 * v * v), ("statcom100_N1", 1, lambda v: 1.0 * v),
                   ("statcom200_N1", 1, lambda v: 2.0 * v), ("none_both", 2, lambda v: 0.0)):
    gm, fm = l17_max(n, qf); l17[key] = dict(Pmax_grid_MW=gm, Pmax_MW=fm)
l17["tripLoad_MW"] = 308.0  # DECISIONS #10: re-tuned after the charging-sign fix (caps-only 300.05 fails by 2.6 %, STATCOM100 325.67 passes by 5.7 %)
LEVELS["L17"] = l17
# ---- L19
L = 6900


def l19_build(ncoal, hydP=225, nh=4, R=0.05):
    rest = L - nh * hydP - 500; n = ncoal - 1
    return [coal(500)] + [coal(rest / n, R=R)] * n + [hyd(hydP)] * nh


def l19row(units, bess=0):
    # DESIGN 3.6 / REVIEW E5: offset dead-zone (the script default "hard" is a jump deadband)
    r = sim(units, bess, dband="zone"); r0 = sim(units, bess, dband="zone", ufls=False)
    return dict(RoCoF0_Hz_s=r["rocof_an"], RoCoF0_rk4_Hz_s=r["rocof_rk4"], nadir_Hz=r["nadir"], t_nadir_s=r["t_nadir"],
                nadir_noUFLS_Hz=r0["nadir"], shed_MW=r["shed"], H_sys_s=r["H"], S_sys_MVA=r["S"], f_end_Hz=r["f_end"])


LEVELS["L19"] = dict(inputs=dict(model="DESIGN 3.6 via review/l19/l19_ce.py (RK4 dt 10 ms, 60 s, offset dead-zone 10 mHz, UFLS 6 stages, 200 ms)",
                                 load_MW=L, trip="500 MW coal unit at t=0", hydro_each_MW=225, BESS="1% droop FFR, T_B 0.2 s"),
                     naive_12coal=l19row(l19_build(12)), coal13=l19row(l19_build(13)), coal13_bess200=l19row(l19_build(13), 200),
                     naive_bess200=l19row(l19_build(12), 200))
LEVELS["L19"]["note"] = "RoCoF0 negative (frequency falls); naive_bess200 is the 'BESS alone 200 MW -> 49.03 Hz' case"

# ============================================================== write
assert len(ORACLES) == 71, len(ORACLES)
meta = dict(generator="tools/oracles/emit_expected.py", numpy=np.__version__, scipy=scipy.__version__,
            note=("All values computed by script from the oracle inputs, unrounded (full float repr); 'printed' = DESIGN 9.1 as printed, "
                  "'printedHalfUlp' = half the last printed digit (used by check_printed.py). Tests compare against values, never printed. "
                  "Naming: <quantity>_<unit> (e.g. I_A, P_W, VS_LL_kV, loss_MW), pu quantities end _pu or are bare names; angles in degrees "
                  "(_deg), sign as in DESIGN 9.1 (PS-06 delta>0 sending leads; PS-13/15 negative angles lag slack; AC-06 phi>0 V leads I; AC-08 lead_deg>0 I leads V). "
                  "Complex quantities are split: <name>_re/_im (rectangular) or <name>_mag/<name>_deg (polar), as printed. "
                  "Row tol/tolKind apply to every value unless a 'tols' override exists for that name. "
                  "Conventions: PS-17/18/19 100 MVA base, line zone 138 kV, T X0=X1=0.10; G-17 ideal tap on bus-1 side with x_t on bus-2 side "
                  "(Y=[[y/t^2,-y/t],[-y/t,y]]); G-04 Qc = capacitor own rating; PS-14 GS order bus 2 then bus 3 with new V2, PV |V| rescaled to 1.05; "
                  "G-12 analytic (expm) and RK4 dt 10 ms; PS-24 closed form and RK4 (dt 0.1 ms and 1 ms). "
                  "Levels: L03 constants IEC 60228 R20 0.727/0.524/0.387 ohm/km, loop 2 km, far converter constant power 5000/0.97 W, "
                  "sending end holds 380 V, loss% = I^2R / P_far; L07/L15/L17/L19 as in each entry's 'inputs'."))
out = dict(meta=meta, oracles=ORACLES, levels=LEVELS)
with open(os.path.join(HERE, "expected.json"), "w") as fh:
    json.dump(out, fh, indent=1, sort_keys=True)
    fh.write("\n")
print(f"wrote {len(ORACLES)} oracles, {len(LEVELS)} levels")
