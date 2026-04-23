import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "./EditArea.css";

/**
 * ================== Important constant ==================
 * Fixed on-screen (CSS pixels) size for a newly added shade marker.
 * From this display size we derive the natural image width/height once,
 * relative to the currently rendered map image.
 * This prevents cumulative scaling/drift after repeated zoom/resize interactions.
 */
const ADD_DISPLAY_SIZE = 30;

/** Trash (delete) icon */
const TrashIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1v13a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7H4a1 1 0 1 1 0-2h4V4a1 1 0 0 1 1-1Zm6 2V4H9v1h6ZM7 7v13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7H7Zm3 3a1 1 0 1 1 2 0v8a1 1 0 1 1-2 0v-8Zm4 0a1 1 0 1 1 2 0v8a1 1 0 1 1-2 0v-8Z" />
  </svg>
);

function EditArea() {
  const { name } = useParams();

  // RBAC — read role from localStorage and compute isAdmin
  const role = Number(localStorage.getItem("shade_role") || 2); // RBAC
  const isAdmin = role === 1; // RBAC

  const [areaData, setAreaData] = useState({
    name: "",
    description: "",
    path: "",
  });
  const [editMode, setEditMode] = useState(false);
  const [editableShades, setEditableShades] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [shades, setShades] = useState([]);
  const [newShade, setNewShade] = useState({
    percentage: "",
    description: "",
    x: null,      // natural image coordinate
    y: null,      // natural image coordinate
    width: null,  // natural — stored only in natural units; derived once from display size
    height: null, // natural
  });
  const [hoveredId, setHoveredId] = useState(null);
  const getId = (s, idx) => s?.id ?? s?.ID ?? s?.Id ?? idx;
  const mapRef = useRef();
  const navigate = useNavigate();
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const imgRef = useRef(null);

  // Displayed image metrics vs natural size (for coordinate transforms)
  const [imgMetrics, setImgMetrics] = useState({
    naturalW: 0,
    naturalH: 0,
    clientW: 0,
    clientH: 0,
    offsetX: 0,
    offsetY: 0,
  });

  // Update metrics from the DOM
  const updateImageMetrics = () => {
    const img = imgRef.current;
    const map = mapRef.current;
    if (!img || !map) return;

    const imgRect = img.getBoundingClientRect();
    const mapRect = map.getBoundingClientRect();

    setImgMetrics({
      naturalW: img.naturalWidth || 0,
      naturalH: img.naturalHeight || 0,
      clientW: imgRect.width,
      clientH: imgRect.height,
      offsetX: imgRect.left - mapRect.left,
      offsetY: imgRect.top - mapRect.top,
    });
  };

  // Convert natural coordinates to display (CSS pixels)
  const project = (natX, natY, natW, natH) => {
    const { naturalW, naturalH, clientW, clientH, offsetX, offsetY } =
      imgMetrics;
    if (!naturalW || !naturalH) {
      return { left: natX, top: natY, width: natW, height: natH };
    }
    const sx = clientW / naturalW;
    const sy = clientH / naturalH;
    return {
      left: offsetX + (Number(natX) || 0) * sx,
      top: offsetY + (Number(natY) || 0) * sy,
      width: (Number(natW) || 0) * sx,
      height: (Number(natH) || 0) * sy,
    };
  };

  // Load area data + shades from the server
  useEffect(() => {
    axios
      .get(`/api/areas/name/${encodeURIComponent(name)}`)
      .then((res) => setAreaData(res.data))
      .catch((err) => console.error("Failed to load area:", err));

    axios
      .get(`/api/shades/${encodeURIComponent(name)}`)
      .then((res) => setShades(res.data))
      .catch((err) => console.error("Failed to load shades:", err));
  }, [name]);

  // Watch image size changes to keep precise positioning
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const ro = new ResizeObserver(() => updateImageMetrics());
    ro.observe(img);

    updateImageMetrics();

    return () => ro.disconnect();
  }, [areaData.path]);

  // Toggle “add shade” mode and reset add form
  const handleToggleAdd = () => {
    if (!isAdmin) return alert("אין הרשאה להוסיף הצללה"); // “No permission to add shade”
    setIsAdding((prev) => !prev);
    // Reset natural values — next click will derive them once from ADD_DISPLAY_SIZE
    setNewShade({
      percentage: "",
      description: "",
      x: null,
      y: null,
      width: null,   // natural (derived from ADD_DISPLAY_SIZE on first placement)
      height: null,  // natural
    });
  };

  // Click on the map: compute placement in image space and convert to natural coords
  const handleMapClick = (e) => {
    if (!isAdmin) return; // RBAC
    if (!isAdding || !mapRef.current || !imgRef.current) return;

    const img = imgRef.current;
    const imgRect = img.getBoundingClientRect();

    const clickXInImg = e.clientX - imgRect.left;
    const clickYInImg = e.clientY - imgRect.top;

    // If natural width/height already provided by user keep them;
    // otherwise derive once from the fixed display size (ADD_DISPLAY_SIZE)
    const scaleX = imgRect.width > 0 ? img.naturalWidth / imgRect.width : 1;
    const scaleY = imgRect.height > 0 ? img.naturalHeight / imgRect.height : 1;

    const natW =
      Number.isFinite(newShade.width) && newShade.width > 0
        ? Math.round(newShade.width)
        : Math.round(ADD_DISPLAY_SIZE * scaleX);

    const natH =
      Number.isFinite(newShade.height) && newShade.height > 0
        ? Math.round(newShade.height)
        : Math.round(ADD_DISPLAY_SIZE * scaleY);

    // Keep marker fully inside the image
    const maxX = imgRect.width - natW / scaleX;
    const maxY = imgRect.height - natH / scaleY;

    const xWithinImg = Math.max(0, Math.min(clickXInImg - (natW / scaleX) / 2, maxX));
    const yWithinImg = Math.max(0, Math.min(clickYInImg - (natH / scaleY) / 2, maxY));

    const natX = Math.round(xWithinImg * scaleX);
    const natY = Math.round(yWithinImg * scaleY);

    // Important: store natural width/height directly (no repeated scaling)
    setNewShade((prev) => ({
      ...prev,
      x: natX,
      y: natY,
      width: natW,   // natural
      height: natH,  // natural
    }));
  };

  const startEdit = () => {
    if (!isAdmin) return alert("אין הרשאה לעריכת אזור"); // “No permission to edit area”
    setEditMode(true);
    setEditableShades(shades.map((s) => ({ ...s })));
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditableShades([]);
  };

  // Update area fields in edit mode
  const handleAreaField = (key, value) => {
    setAreaData((prev) => ({ ...prev, [key]: value }));
  };

  // Update a specific shade field in the edit table
  const handleShadeField = (idx, key, value) => {
    setEditableShades((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        [key]:
          key === "percentage" ? String(value).replace(/[^\d]/g, "") : value,
      };
      return next;
    });
  };

  // Save edits (area + modified shades)
  const saveEdit = async () => {
    if (!isAdmin) return alert("אין הרשאה לשמור שינויים"); // “No permission to save”
    try {
      const areaPayload = {
        name: areaData.name,
        description: areaData.description,
      };
      await axios.put(
        `/api/areas/name/${encodeURIComponent(name)}`,
        areaPayload
      );

      // Apply only changed shade fields
      const byId = new Map(shades.map((s, i) => [getId(s, i), s]));
      for (let i = 0; i < editableShades.length; i++) {
        const cur = editableShades[i];
        const id = getId(cur, i);
        const orig = byId.get(id);
        if (!orig) continue;
        const next = {};
        const curPct = cur.percentage ?? cur.Percentage ?? cur.percent;
        const origPct = orig.percentage ?? orig.Percentage ?? orig.percent;
        const curDesc = cur.description ?? cur.Description ?? "";
        const origDesc = orig.description ?? orig.Description ?? "";
        if (String(curPct ?? "") !== String(origPct ?? "")) next.percentage = Number(curPct) || 0;
        if (curDesc !== origDesc) next.description = curDesc;
        if (Object.keys(next).length > 0) {
          await axios.put(`/api/shades/${id}`, next);
        }
      }

      // Refresh from server after save
      const updatedArea = await axios.get(
        `/api/areas/name/${encodeURIComponent(areaData.name)}`
      );
      setAreaData(updatedArea.data);
      const updatedShades = await axios.get(
        `/api/shades/${encodeURIComponent(areaData.name)}`
      );
      setShades(updatedShades.data);
      setEditMode(false);
    } catch (err) {
      console.error("Save edit failed:", err);
      alert("❌ שמירה נכשלה");
    }
  };

  // Add a new shade
  const handleSaveShade = async () => {
    if (!isAdmin) return alert("אין הרשאה להוסיף הצללה"); // RBAC
    const { percentage, description, x, y, width, height } = newShade;
    if (!percentage || !description || x === null || y === null) {
      return alert("מלא את כל השדות לפני שמירה"); // “Fill all fields before saving”
    }

    try {
      await axios.post("/api/shades", {
        Area: areaData.name,
        percentage: parseFloat(percentage),
        description,
        x,
        y,
        width,
        height,
      });
      alert("✔️ הצללה נשמרה בהצלחה"); // “Saved successfully”
      setIsAdding(false);

      const updated = await axios.get(
        `/api/shades/${encodeURIComponent(areaData.name)}`
      );
      setShades(updated.data);
    } catch (err) {
      console.error("Saving shade failed:", err);
      alert("❌ שגיאה בשמירה");
    }
  };

  // Delete a shade
  const handleDeleteShade = async (idLike) => {
    if (!isAdmin) return alert("אין הרשאה למחיקה"); // RBAC
    const id = idLike?.id ?? idLike?.ID ?? idLike; // tolerate different API field names
    if (!id) return alert("אין מזהה להצללה למחיקה"); // “Missing id”

    if (!window.confirm("למחוק את ההצללה?")) return; // “Delete this shade?”

    try {
      await axios.delete(`/api/shades/${id}`);
      setShades((prev) => prev.filter((s) => (s.id ?? s.ID) !== id));
    } catch (err) {
      console.error("Delete shade failed:", err);
      alert("❌ שגיאה במחיקת הצללה");
    }
  };

  const formatPercent = (v) => {
    const n = typeof v === "number" ? v : parseFloat(v);
    if (!Number.isFinite(n)) return "";
    return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
  };

  // Compute badge popup style based on marker size
  const getBadgeStyle = (w, h) => {
    const minDim = Math.max(1, Math.min(Number(w) || 0, Number(h) || 0));
    const font = Math.round(Math.max(12, Math.min(28, minDim * 0.22)));
    const padY = Math.round(Math.max(2, font * 0.25));
    const padX = Math.round(Math.max(6, font * 0.4));
    const top = -(font + padY * 2 + 6);
    return {
      fontSize: `${font}px`,
      padding: `${padY}px ${padX}px`,
      borderRadius: `${Math.round(font * 0.5)}px`,
      top: `${top}px`,
    };
  };

  const pick = (obj, keys) => {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    return undefined;
  };

  const displayShades = editMode ? editableShades : shades;

  return (
    <div className="edit-area">
      <div className="area-row">
        {/* Area map with shade overlay */}
        <div className="map-wrap">
          <div className="map" ref={mapRef} onClick={handleMapClick}>
            {areaData.path ? (
              <img
                ref={imgRef}
                src={`/uploads/${areaData.path}`}
                alt="Map"
                className="map-image"
                onLoad={updateImageMetrics}
              />
            ) : (
              <p>🗺 כאן תופיע המפה שלך</p>
            )}

            {displayShades.map((shade, i) => {
              const natX = Number(pick(shade, ["x", "X"]));
              const natY = Number(pick(shade, ["y", "Y"]));
              const natW = Number(pick(shade, ["width", "Width"]));
              const natH = Number(pick(shade, ["height", "Height"]));
              const pos = project(natX, natY, natW, natH);

              const id = getId(shade, i);
              return (
                <div
                  key={id}
                  className={`shade-marker ${hoveredId === id ? "is-hovered" : ""}`}
                  style={{
                    left: `${pos.left}px`,
                    top: `${pos.top}px`,
                    width: `${pos.width}px`,
                    height: `${pos.height}px`,
                  }}
                  onMouseEnter={() => setHoveredId(id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(id)}
                  onBlur={() => setHoveredId(null)}
                  tabIndex={0}
                >
                  <span
                    className="shade-percent"
                    style={getBadgeStyle(pos.width, pos.height)}
                  >
                    {formatPercent(pick(shade, ["percentage", "Percentage"]))}
                  </span>
                  {(() => {
                    const raw = pick(shade, ["percentage", "Percentage", "percent"]);
                    const pct = Math.max(0, Math.min(100, Number(raw) || 0));
                    return <div className="shade-dot" style={{ "--pct": pct }} />;
                  })()}
                  {/* Delete button — admin only */}
                  {isAdmin && (
                    <button
                      className="shade-delete"
                      aria-label="מחק הצללה"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteShade(shade);
                      }}
                      title="מחק"
                    >
                      <span className="trash-red">
                        <TrashIcon size={14} />
                      </span>
                    </button>
                  )}
                </div>
              );
            })}

            {/* Preview of the new shade while adding — admin only */}
            {isAdmin &&
              isAdding &&
              newShade.x != null &&
              newShade.y != null &&
              (() => {
                const pos = project(
                  newShade.x,
                  newShade.y,
                  newShade.width ?? 0,
                  newShade.height ?? 0
                );
                return (
                  <div
                    className="shade-marker"
                    style={{
                      left: `${pos.left}px`,
                      top: `${pos.top}px`,
                      width: `${pos.width}px`,
                      height: `${pos.height}px`,
                    }}
                  >
                    {newShade.percentage !== "" && (
                      <span
                        className="shade-percent"
                        style={getBadgeStyle(pos.width, pos.height)}
                      >
                        {formatPercent(newShade.percentage)}
                      </span>
                    )}
                    <div
                      className="shade-dot"
                      style={{ "--pct": Number(newShade.percentage) || 0 }}
                    />
                  </div>
                );
              })()}
          </div>
        </div>

        {/* Right panel: area details, actions, add form, and shades table */}
        <aside className="shade-panel" aria-label="טבלת הצללות">
          {/* Area details + edit mode */}
          {editMode ? (
            <>
              <label className="field-label">שם האזור</label>
              <input
                className="shade-input"
                value={areaData.name}
                onChange={(e) => handleAreaField("name", e.target.value)}
                disabled={!isAdmin} // RBAC
              />
              <label className="field-label">תיאור האזור</label>
              <textarea
                className="shade-input"
                rows={3}
                value={areaData.description}
                onChange={(e) => handleAreaField("description", e.target.value)}
                disabled={!isAdmin} // RBAC
              />
              <div className="panel-actions">
                {isAdmin && (
                  <button className="button" onClick={saveEdit}> שמור </button>
                )}
                <button className="button" onClick={cancelEdit}> בטל </button>
              </div>
            </>
          ) : (
            <>
              <div className="panel-area-info">
                <h2 className="panel-area-title">{areaData.name}</h2>
                <p className="panel-area-desc">{areaData.description}</p>
              </div>
              {!isAdding && isAdmin && (
                <div className="panel-actions">
                  <button className="button button-primary" onClick={startEdit}> עריכת אזור </button>
                  <button className="button button-primary" onClick={handleToggleAdd}> הוספת הצללה </button>
                </div>
              )}
            </>
          )}

          {/* Add-shade form in the panel — admin only */}
          {isAdmin && isAdding && (
            <div className="panel-sticky">
              <div className="shade-form">
                <input
                  type="number"
                  placeholder="אחוז"
                  value={newShade.percentage}
                  onChange={(e) =>
                    setNewShade({ ...newShade, percentage: e.target.value })
                  }
                />
                <input
                  type="text"
                  placeholder="תיאור"
                  value={newShade.description}
                  onChange={(e) =>
                    setNewShade({ ...newShade, description: e.target.value })
                  }
                />
                <input
                  type="number"
                  placeholder="X (natural)"
                  value={newShade.x ?? ""}
                  onChange={(e) =>
                    setNewShade({ ...newShade, x: parseInt(e.target.value) })
                  }
                />
                <input
                  type="number"
                  placeholder="Y (natural)"
                  value={newShade.y ?? ""}
                  onChange={(e) =>
                    setNewShade({ ...newShade, y: parseInt(e.target.value) })
                  }
                />
                <input
                  type="number"
                  placeholder="רוחב (natural)"
                  value={newShade.width ?? ""}
                  onChange={(e) =>
                    setNewShade({
                      ...newShade,
                      width: parseInt(e.target.value),
                    })
                  }
                />
                <input
                  type="number"
                  placeholder="גובה (natural)"
                  value={newShade.height ?? ""}
                  onChange={(e) =>
                    setNewShade({
                      ...newShade,
                      height: parseInt(e.target.value),
                    })
                  }
                />
                <button className="button" onClick={handleSaveShade}> שמור </button>
                <button className="button" onClick={handleToggleAdd}> בטל </button>
              </div>
              
            </div>
          )}

          <div className="panel-card">
            <div className="panel-header">
              <h3>הצללות</h3>
            </div>
            <div className="panel-subtitle">
              מספר ההצללות באזור – {editMode ? editableShades.length : shades.length}
            </div>

            <div className="panel-table-wrap">
              <table className="shade-table">
                <thead>
                  <tr>
                    <th>שם הצללה</th>
                    <th>אחוז</th>
                    <th className="del-head">מחיקה</th>
                  </tr>
                </thead>
                <tbody>
                  {(editMode ? editableShades : shades).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="empty-row">אין הצללות להצגה</td>
                    </tr>
                  ) : (
                    (editMode ? editableShades : shades).map((s, idx) => {
                      const desc = pick(s, ["description", "Description"]) ?? "";
                      const pct = pick(s, ["percentage", "Percentage"]);
                      const rowId = getId(s, idx);
                      return (
                        <tr
                          key={rowId}
                          className={`shade-row ${hoveredId === rowId ? "is-hovered" : ""}`}
                          onMouseEnter={() => setHoveredId(rowId)}
                          onMouseLeave={() => setHoveredId(null)}
                          onFocus={() => setHoveredId(rowId)}
                          onBlur={() => setHoveredId(null)}
                          tabIndex={0}
                        >
                          <td className="desc-cell" title={desc}>
                            {editMode && isAdmin ? (
                              <input
                                className="shade-input"
                                value={desc}
                                onChange={(e) =>
                                  handleShadeField(idx, "description", e.target.value)
                                }
                              />
                            ) : (
                              desc || "—"
                            )}
                          </td>
                          <td className="pct-cell">
                            {editMode && isAdmin ? (
                              <input
                                type="number"
                                min="0"
                                max="100"
                                className="percent-input"
                                value={pct ?? ""}
                                onChange={(e) =>
                                  handleShadeField(idx, "percentage", e.target.value)
                                }
                              />
                            ) : (
                              formatPercent(pct) || "—"
                            )}
                          </td>
                          <td className="del-cell">
                            {isAdmin ? (
                              <button
                                className="table-delete"
                                aria-label="מחק הצללה"
                                title="מחק"
                                onClick={() => handleDeleteShade(s)}
                                disabled={editMode}
                              >
                                <span className="trash-red">
                                  <TrashIcon />
                                </span>
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Back button — below the table */}
          <div className="panel-footer">
            <button className="button" onClick={handleBack}> חזרה </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default EditArea;
