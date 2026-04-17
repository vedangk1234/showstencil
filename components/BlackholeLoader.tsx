export default function BlackholeLoader() {
  return (
    <>
      <style>{`
        .bh-loader {
          display: flex;
          width: 8rem;
          height: 8rem;
          justify-content: center;
          align-items: center;
          position: relative;
          flex-direction: column;
        }
        .bh-curve {
          width: 180%;
          height: 180%;
          position: absolute;
          animation: bh-rotate 8s linear infinite;
          fill: transparent;
        }
        .bh-curve text {
          letter-spacing: 20px;
          text-transform: uppercase;
          font: 1.5em "Fira Sans", sans-serif;
          fill: white;
          filter: drop-shadow(0 2px 8px black);
        }
        .bh-blackhole {
          z-index: -1;
          display: flex;
          position: absolute;
          width: 8rem;
          height: 8rem;
          align-items: center;
          justify-content: center;
        }
        .bh-circle {
          z-index: 0;
          display: flex;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: radial-gradient(circle at center, black 25%, white 35%, white 100%);
          box-shadow: 0px 0px 2rem #c2babb;
          align-items: center;
          justify-content: center;
        }
        .bh-circle::after {
          z-index: 0;
          position: absolute;
          content: "";
          display: flex;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 4px solid white;
          background: radial-gradient(circle at center, black 35%, white 60%, white 100%);
          box-shadow: 0px 0px 5rem #c2babb;
          align-items: center;
          justify-content: center;
          filter: blur(4px);
          animation: bh-pulse linear infinite 2s alternate-reverse;
        }
        .bh-circle::before {
          z-index: 1;
          content: "";
          display: flex;
          width: 4rem;
          height: 4rem;
          border: 2px solid #ffffff;
          box-shadow: 3px 3px 10px #c2babb, inset 0 0 1rem #ffffff;
          border-radius: 50%;
          top: 5rem;
          filter: blur(0.5px);
          animation: bh-rotate linear infinite 3s;
        }
        .bh-disc {
          position: absolute;
          z-index: 0;
          display: flex;
          width: 5rem;
          height: 10rem;
          border-radius: 50%;
          background: radial-gradient(circle at center, #ffffff 80%, #353535 90%, white 100%);
          filter: blur(1rem) brightness(130%);
          border: 1rem solid white;
          box-shadow: 0px 0px 3rem #d7c4be;
          transform: rotate3d(1, 1, 1, 220deg);
          animation: bh-pulse2 linear infinite 2s alternate-reverse;
        }
        .bh-disc::before {
          content: "";
          position: absolute;
          z-index: 0;
          display: flex;
          width: 5rem;
          height: 10rem;
          border-radius: 50%;
          background: radial-gradient(circle at center, #ffffff 80%, #353535 90%, white 100%);
          filter: blur(3rem);
          border: 1rem solid white;
          box-shadow: 0px 0px 6rem #d7c4be;
          animation: bh-pulse linear infinite 2s alternate-reverse;
        }
        @keyframes bh-rotate {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes bh-pulse {
          0%   { box-shadow: 0px 0px 3rem #c2babb; transform: scale(1); }
          100% { box-shadow: 0px 0px 5rem #c2babb; transform: scale(1.09); }
        }
        @keyframes bh-pulse2 {
          0%   { box-shadow: 0px 0px 3rem #c2babb; transform: rotate3d(1, 1, 1, 220deg) scale(1); }
          100% { box-shadow: 0px 0px 5rem #c2babb; transform: rotate3d(1, 1, 1, 220deg) scale(0.95); }
        }
      `}</style>

      <div className="bh-loader">
        <svg className="bh-curve" viewBox="0 0 200 200">
          <defs>
            <path id="bh-curve-path" d="M 100,100 m -75,0 a 75,75 0 1,1 150,0 a 75,75 0 1,1 -150,0" />
          </defs>
          <text>
            <textPath href="#bh-curve-path">SHOWSTENCIL · SCOUTING YOUR NICHE · </textPath>
          </text>
        </svg>
        <div className="bh-blackhole">
          <div className="bh-circle" />
          <div className="bh-disc" />
        </div>
      </div>
    </>
  )
}
