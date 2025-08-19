import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

// You will need to replace this with your actual API Gateway endpoint
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

interface Image {
  ImageKey: string;
  ThumbnailUrl: string;
}

const ImageList = () => {
  const [images, setImages] = useState<Image[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/images`);
        if (!response.ok) {
          throw new Error("Failed to fetch image list");
        }
        const data = await response.json();
        setImages(data.images || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
      }
    };

    fetchImages();
  }, []);

  if (error) {
    return <div className="alert alert-danger">Error: {error}</div>;
  }

  return (
    <div>
      <h1 className="mb-4">Image Gallery</h1>
      <div className="d-flex flex-wrap">
        {images.map((image) => (
          <div key={image.ImageKey} className="m-2">
            <div className="card" style={{ display: "inline-block" }}>
              <Link to={`/image/${encodeURIComponent(image.ImageKey)}`}>
                <img
                  src={image.ThumbnailUrl}
                  className="card-img-top"
                  alt={image.ImageKey}
                  style={{ width: "200px", height: "200px", objectFit: "cover" }}
                />
              </Link>
              <div className="card-body">
                <p className="card-text text-truncate">{image.ImageKey}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageList;

