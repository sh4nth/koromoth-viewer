import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../utils/api";

interface Image {
  ImageKey: string;
  ThumbnailUrl: string;
}

const ImageList = () => {
  const [images, setImages] = useState<Image[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tagInput, setTagInput] = useState("");

  const activeTags = useMemo(() => searchParams.getAll("tag"), [searchParams]);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        let url = `/images`;
        if (activeTags.length > 0) {
          const query = new URLSearchParams();
          activeTags.forEach((tag) => query.append("tag", tag));
          url += `?${query.toString()}`;
        }

        const response = await apiFetch(url);
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
    // Set the input field to reflect the current URL state
    setTagInput(activeTags.join(", "));
  }, [activeTags]); // Re-run effect when activeTags change

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const newTags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (newTags.length > 0) {
      setSearchParams({ tag: newTags });
    } else {
      setSearchParams({});
    }
  };

  if (error) {
    return <div className="alert alert-danger">Error: {error}</div>;
  }

  return (
    <div className="d-flex">
      {/* Main Content Area */}
      <div className="flex-grow-1 p-4">
        <h1 className="mb-4">Image Gallery</h1>

        {/* Image Grid */}
        <div className="d-flex flex-wrap">
          {images.map((image) => (
            <div key={image.ImageKey} className="m-2">
              <div className="card" style={{ display: "inline-block" }}>
                <Link to={`/image/${encodeURIComponent(image.ImageKey)}`}>
                  <img
                    src={image.ThumbnailUrl}
                    className="card-img-top"
                    alt={image.ImageKey}
                    style={{
                      width: "200px",
                      height: "200px",
                      objectFit: "cover",
                    }}
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

      {/* Info Box Area */}
      <div
        className="p-4 bg-light text-dark"
        style={{
          width: "300px",
          minWidth: "300px",
          borderLeft: "1px solid #ccc",
          height: "100vh",
        }}
      >
        <h5 className="mb-3">Filter by Tags</h5>
        {/* Filter Form */}
        <form onSubmit={handleFilter} className="mb-4">
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder="e.g. sunset, beach"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
            />
            <button className="btn btn-primary" type="submit">
              Filter
            </button>
          </div>
        </form>

        <h5 className="mb-3">Current Filter</h5>
        {activeTags.length > 0 ? (
          <div>
            {activeTags.map((tag, index) => (
              <span key={index} className="badge bg-success me-1">
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p>No tags selected. Showing all images.</p>
        )}
      </div>
    </div>
  );
};

export default ImageList;
