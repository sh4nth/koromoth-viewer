import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import exifr from "exifr";
import { BsPencil, BsCheck, BsX } from "react-icons/bs";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

interface ExifData {
  Make?: string;
  Model?: string;
  ExposureTime?: number;
  FNumber?: number;
  ISO?: number;
  LensModel?: string;
  DateTimeOriginal?: Date;
}

const ImageDetail = () => {
  const { imageKey } = useParams<{ imageKey: string }>();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [exif, setExif] = useState<ExifData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State for tag editing
  const [isEditing, setIsEditing] = useState(false);
  const [tagsToDelete, setTagsToDelete] = useState(new Set<string>());
  const [tagsToAdd, setTagsToAdd] = useState(new Set<string>());
  const [tagInput, setTagInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      tagInputRef.current?.focus();
    }
  }, [isEditing]);

  const fetchTags = async () => {
    if (!imageKey) return;
    const tagsResponse = await fetch(`${API_BASE_URL}/image/${imageKey}/tags`);
    if (!tagsResponse.ok) {
      throw new Error("Failed to fetch tags");
    }
    const tagsData = await tagsResponse.json();
    setTags(tagsData.tags || []);
  };

  useEffect(() => {
    if (!imageKey) return;

    const fetchImageDetails = async () => {
      try {
        setError(null);
        // 1. Fetch the presigned URL for the image
        const urlResponse = await fetch(`${API_BASE_URL}/image/${imageKey}`);
        if (!urlResponse.ok) {
          throw new Error("Failed to fetch image URL");
        }
        const urlData = await urlResponse.json();
        setImageUrl(urlData.imageUrl);

        // 2. Fetch the image data itself to parse EXIF info
        const imageBlobResponse = await fetch(urlData.imageUrl);
        if (!imageBlobResponse.ok) {
          throw new Error("Failed to download image for EXIF parsing");
        }
        const imageBlob = await imageBlobResponse.blob();
        const parsedExif = await exifr.parse(imageBlob);
        setExif(parsedExif);

        // 3. Fetch the tags for the image
        await fetchTags();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
      }
    };

    fetchImageDetails();
  }, [imageKey]);

  const handleEditClick = () => {
    setIsEditing(true);
    setTagsToDelete(new Set());
    setTagsToAdd(new Set());
  };

  const performSave = async (
    tagsToAddSet: Set<string>,
    tagsToDeleteSet: Set<string>,
  ) => {
    if (!imageKey) return;
    setIsSaving(true);
    setError(null);

    try {
      // Delete tags
      if (tagsToDeleteSet.size > 0) {
        const res = await fetch(`${API_BASE_URL}/image/${imageKey}/tags`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: Array.from(tagsToDeleteSet) }),
        });
        if (!res.ok) throw new Error("Failed to delete tags.");
      }

      // Add tags
      if (tagsToAddSet.size > 0) {
        const res = await fetch(`${API_BASE_URL}/image/${imageKey}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: Array.from(tagsToAddSet) }),
        });
        if (!res.ok) throw new Error("Failed to add tags.");
      }

      await fetchTags();
      setIsEditing(false);
      setTagsToAdd(new Set());
      setTagsToDelete(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveClick = () => {
    performSave(tagsToAdd, tagsToDelete);
  };

  const handleCancelClick = () => {
    setIsEditing(false);
  };

  const handleExistingTagClick = (tag: string) => {
    if (tagsToDelete.has(tag)) {
      setTagsToDelete((prev) => {
        const next = new Set(prev);
        next.delete(tag);
        return next;
      });
    } else {
      setTagsToDelete((prev) => new Set(prev).add(tag));
    }
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const newTag = tagInput.trim();

    if (e.key === ",") {
      e.preventDefault();
      if (newTag && !tags.includes(newTag)) {
        setTagsToAdd((prev) => new Set(prev).add(newTag));
      }
      setTagInput("");
    }

    if (e.key === "Enter") {
      e.preventDefault();
      let newTagsToAdd = tagsToAdd;
      if (newTag && !tags.includes(newTag)) {
        newTagsToAdd = new Set(tagsToAdd).add(newTag);
        setTagsToAdd(newTagsToAdd);
      }
      performSave(newTagsToAdd, tagsToDelete);
      setTagInput("");
    }
  };

  if (error) {
    return <div className="alert alert-danger">Error: {error}</div>;
  }

  if (!imageUrl) {
    return <div>Loading...</div>;
  }

  const displayedTags = [...tags, ...tagsToAdd];

  return (
    <div className="d-flex" style={{ height: "100vh" }}>
      {/* Image Display Area */}
      <div className="flex-grow-1 d-flex align-items-center justify-content-center bg-dark p-3">
        <img
          src={imageUrl}
          alt={imageKey}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </div>

      {/* Info Box Area */}
      <div
        className="p-4 bg-light text-dark"
        style={{
          width: "350px",
          overflowY: "auto",
          borderLeft: "1px solid #ccc",
        }}
      >
        <Link to="/" className="btn btn-secondary mb-4">
          &larr; Back to Gallery
        </Link>
        <h3 className="mb-3">{imageKey}</h3>

        {/* Tags Section */}
        <div className="mb-4">
          <div className="d-flex align-items-center mb-2">
            <h5 className="mb-0 me-2">Tags</h5>
            {!isEditing ? (
              <button
                className="btn btn-sm btn-link text-primary"
                onClick={handleEditClick}
              >
                <BsPencil />
              </button>
            ) : (
              <div>
                <button
                  className="btn btn-sm btn-success me-2"
                  onClick={handleSaveClick}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : <BsCheck />}
                </button>
                <button
                  className="btn btn-sm btn-link text-secondary"
                  onClick={handleCancelClick}
                  disabled={isSaving}
                >
                  <BsX />
                </button>
              </div>
            )}
          </div>
          {displayedTags.length > 0 ? (
            <div>
              {displayedTags.map((tag) =>
                isEditing ? (
                  <span
                    key={tag}
                    className={`badge me-1 ${
                      tagsToDelete.has(tag)
                        ? "bg-danger text-decoration-line-through"
                        : tagsToAdd.has(tag)
                          ? "bg-success"
                          : "bg-secondary"
                    }`}
                    onClick={() => handleExistingTagClick(tag)}
                    style={{ cursor: "pointer" }}
                  >
                    {tag}
                  </span>
                ) : (
                  <Link
                    to={`/?tag=${tag}`}
                    key={tag}
                    className="badge bg-primary me-1 text-decoration-none"
                  >
                    {tag}
                  </Link>
                ),
              )}
            </div>
          ) : (
            <p>No tags assigned.</p>
          )}
          {isEditing && (
            <input
              ref={tagInputRef}
              type="text"
              className="form-control form-control-sm mt-2"
              placeholder="Add a tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagInputKeyDown}
            />
          )}
        </div>

        {/* EXIF Data Section */}
        <div className="mb-4">
          <h5>Details</h5>
          {exif ? (
            <ul className="list-unstyled">
              {exif.Make && (
                <li>
                  <strong>Make:</strong> {exif.Make}
                </li>
              )}
              {exif.Model && (
                <li>
                  <strong>Model:</strong> {exif.Model}
                </li>
              )}
              {exif.ExposureTime && (
                <li>
                  <strong>Exposure:</strong> {exif.ExposureTime.toFixed(4)}s
                </li>
              )}
              {exif.FNumber && (
                <li>
                  <strong>Aperture:</strong> f/{exif.FNumber}
                </li>
              )}
              {exif.ISO && (
                <li>
                  <strong>ISO:</strong> {exif.ISO}
                </li>
              )}
              {exif.LensModel && (
                <li>
                  <strong>Lens:</strong> {exif.LensModel}
                </li>
              )}
              {exif.DateTimeOriginal && (
                <li>
                  <strong>Taken:</strong>{" "}
                  {exif.DateTimeOriginal.toLocaleString()}
                </li>
              )}
            </ul>
          ) : (
            <p>Loading EXIF data...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageDetail;
