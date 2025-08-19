import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import exifr from "exifr";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

interface Tag {
  Tag: string;
  ImageKey: string;
}

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

  useEffect(() => {
    if (!imageKey) return;

    const fetchImageDetails = async () => {
      try {
        // 1. Fetch the presigned URL for the image
        const urlResponse = await fetch(`${API_BASE_URL}/image/${imageKey}`);
        if (!urlResponse.ok) {
          throw new Error("Failed to fetch image URL");
        }
        const urlData = await urlResponse.json();
        setImageUrl(urlData.imageUrl);

	// 2. Fetch the image data itself to parse EXIF info
        // The browser will likely cache this request.
        const imageBlobResponse = await fetch(urlData.imageUrl);
        if (!imageBlobResponse.ok) {
          throw new Error("Failed to download image for EXIF parsing");
        }
        const imageBlob = await imageBlobResponse.blob();
        const parsedExif = await exifr.parse(imageBlob);
        setExif(parsedExif);

        // 3. Fetch the tags for the image
        const tagsResponse = await fetch(`${API_BASE_URL}/image/${imageKey}/tags`);
        if (!tagsResponse.ok) {
          throw new Error("Failed to fetch tags");
        }
        const tagsData = await tagsResponse.json();
        setTags(tagsData.tags || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
      }
    };

    fetchImageDetails();
  }, [imageKey]);

  if (error) {
    return <div className="alert alert-danger">Error: {error}</div>;
  }

  if (!imageUrl) {
    return <div>Loading...</div>;
  }

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
          <h5>Tags</h5>
          {tags.length > 0 ? (
            <div>
              {tags.map((tag) => (
                <span key={tag} className="badge bg-primary me-1">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p>No tags assigned.</p>
          )}
        </div>

        {/* EXIF Data Section */}
        <div className="mb-4">
          <h5>Details</h5>
          {exif ? (
            <ul className="list-unstyled">
              {exif.Make && <li><strong>Make:</strong> {exif.Make}</li>}
              {exif.Model && <li><strong>Model:</strong> {exif.Model}</li>}
              {exif.ExposureTime && <li><strong>Exposure:</strong> {exif.ExposureTime.toFixed(4)}s</li>}
              {exif.FNumber && <li><strong>Aperture:</strong> f/{exif.FNumber}</li>}
              {exif.ISO && <li><strong>ISO:</strong> {exif.ISO}</li>}
              {exif.LensModel && <li><strong>Lens:</strong> {exif.LensModel}</li>}
              {exif.DateTimeOriginal && <li><strong>Taken:</strong> {exif.DateTimeOriginal.toLocaleString()}</li>}
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
