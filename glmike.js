/*
 * Copyright (C) 2011-2012 Frogtoss Games, Inc.
 *
 * This software is provided 'as-is', without any express or implied
 * warranty. In no event will the authors be held liable for any damages
 * arising from the use of this software.
 *
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 *
 *    1. The origin of this software must not be misrepresented; you must not
 *    claim that you wrote the original software. If you use this software
 *    in a product, an acknowledgment in the product documentation would be
 *    appreciated but is not required.
 *
 *    2. Altered source versions must be plainly marked as such, and must not
 *    be misrepresented as being the original software.
 *
 *    3. This notice may not be removed or altered from any source
 *    distribution.
 */

/*
  Things that need doing:

   - BUG: I can't get postGrayscale to deliver any differences in some
layers.  The first and last layer of zombie.xml for example.

   - More shaders!  DOF would be huge.

   - Helper function to set the projection uniform for all materials in texman

   - Blit intermediate to final at different stages, including post processing textures.

   - Particles. jfdi.  In 3d, using depth testing.

   - UIDs for putboxes so the calling code can pull them out and have handles to them.

   - API-level (not data-level) ease of rendering to texture, having
     that texture be placed in the texman and be referenced by further planespans.

   - Use VBOs, not drawarray calls for maximum performance.

  */

/* Scene globals */
var gl;
var scene = {};
scene.mvMatrix = mat4.create();
scene.pMatrix  = mat4.create();
scene.mvMatrixStack = [];
scene.closestZ = 1;
scene.rt = {};
scene.animateCamera = false;
scene.cameraPos = [0,0,1];
scene.lightPos = [1,1,1];

//
// Begin helpers
//

function mvPushMatrix( s ) {
    var copy = mat4.create();
    mat4.set( s.mvMatrix, copy );
    s.mvMatrixStack.push( copy );
}

function mvPopMatrix( s ) {
    if ( s.mvMatrixStack.length == 0 ) {
        throw "Invalid popMatrix!";
    }

    s.mvMatrix = s.mvMatrixStack.pop();
}

function getArg(name) {
    return decodeURI(
        (RegExp(name + '=' + '(.+?)(&|$)').exec(location.search)||[,null])[1]
    );
}


//
// End helpers
//

function initBuffers( panel ) {
    /* plane setup */
    scene.planeSpan = new ftgPlaneSpan();

    // Programmatically generate panel or not
    if ( panel == 'null' ) {
        // Foreground one
        var p = scene.planeSpan.allocPlane();
        p.addObb( [-2,0,0], [0.75,1.25], 90.0,  "texture.gif", undefined );
        p.addObb( [0,0,0], [0.75,1.25], 45.0,  "texture.gif", ftg.mats.silouhette );
        //p.addObb( [0,0,0], [0.75,1.25], 45.0,  "texture.gif", undefined );
        p.addZ( -4.0 );

        // Background one
        var p = scene.planeSpan.allocPlane();
        p.addObb( [0,0,0], [1.5,1.5], 180.0, "texture.gif" );
        p.addObb( [-2,-2,0], [1.25,1.25], 0.0,  "nehe.gif" );
        p.addZ( -8.0 );

        var p = scene.planeSpan.allocPlane();
        p.addObb( [0,-1,0], [0.75,1.25], -45.0,  "nehe.gif" );    
        p.addZ( -10.0 );
    } else {
        scene.planeSpan.loadPanel( "/resources/" + panel + ".xml" );
    }

    scene.planeSpan.updateZOrder();

    /* rendertarget setup */

    // Blit to screen on command or after no more planes exist
    scene.rt.intermediate = new ftgRenderTarget();
    scene.rt.intermediate.init( gl.viewportWidth, gl.viewportHeight );

}

function initShaders() {
    // postprocessing shader values 
    var postShaderValues = function() {
        this.bindAttribute( "aVertexPosition" );
        this.bindAttribute( "aTextureCoord" );

        this.initUniform( "uPMatrix" );
        this.initUniform( "uMVMatrix" );
        this.initUniform( "uSampler" );
        this.initUniform( "uTextureSize" );
    }

    /* Post processing shaders */
    var post = new ftgMaterial();
    post.initShaderValues = postShaderValues;
    post.initShaderById( "post", "vpost", "fpost" );

    var postGrayscale = new ftgMaterial();
    postGrayscale.initShaderValues = function() {
        this.bindAttribute( "aVertexPosition" );
        this.bindAttribute( "aTextureCoord" );

        this.initUniform( "uPMatrix" );
        this.initUniform( "uMVMatrix" );
        this.initUniform( "uSampler" );
        this.initUniform( "uTextureSize" );
        this.initUniform( "grayness" );
    }
    postGrayscale.initShaderById( "postGrayscale", "vpost", "fpostGrayscale" );

    // Full screen blur
    var postBlur = new ftgMaterial();
    postBlur.initShaderValues = function() {
        this.bindAttribute( "aVertexPosition" );
        this.bindAttribute( "aTextureCoord" );

        this.initUniform( "uPMatrix" );
        this.initUniform( "uMVMatrix" );
        this.initUniform( "uSampler" );
        this.initUniform( "uTextureSize" );
        this.initUniform( "radius" );
    }
    postBlur.initShaderById( "postBlur", "vpost", "fpostblur" );



    // Graham test shader 1:
    // Shadow stamping
    var shadowStamp = new ftgMaterial();
    shadowStamp.initShaderValues = function() {
        this.bindAttribute( "aVertexPosition" );
        this.bindAttribute( "aTextureCoord" );

        this.initUniform( "uPMatrix" );
        this.initUniform( "uMVMatrix" );
        this.initUniform( "uSampler" );
        this.initUniform( "uBoxMatrix" );
    }
    shadowStamp.initShaderById( "shadowStamp", "vdef", "fshadowstamp" );


    // Graham test shader 2:
    // Normal maps
    //var bumpMap = new ftgMaterial();
    //bumpMap.initShaderValues = function() {
        //this.bindAttribute( "aVertexPosition" );
        //this.bindAttribute( "aVertexNormal" );
        //this.bindAttribute( "aVertexTangent" );
        //this.bindAttribute( "aTextureCoord" );

        //this.initUniform( "uPMatrix" );
        //this.initUniform( "uMVMatrix" );
        //this.initUniform( "uNMatrix" );
        //this.initUniform( "uSampler" );
        //this.initUniform( "uNormalSampler" );

        //this.initUniform( "uBoxMatrix" );

        //this.initUniform( "uLightDirection" );
        //this.initUniform( "uLightColor" );
    //}
    //bumpMap.initShaderById( "bumpMap", "vbump", "ftoonbump" );
    
    var normalAndDepth = new ftgMaterial();
    normalAndDepth.initShaderValues = function() {
        this.bindAttribute( "aVertexPosition" );
        this.bindAttribute( "aVertexNormal" );
        this.bindAttribute( "aVertexTangent" );
        this.bindAttribute( "aTextureCoord" );

        this.initUniform( "uPMatrix" );
        this.initUniform( "uMVMatrix" );
        this.initUniform( "uNMatrix" );
        this.initUniform( "uSampler" );
        this.initUniform( "uNormalSampler" );

        this.initUniform( "uBoxMatrix" );
    }
    normalAndDepth.initShaderById( "normalAndDepth", "vNormalAndDepth", "fNormalAndDepth" );
}


function draw() {
    {
        gl.viewport( 0, 0, gl.viewportWidth, gl.viewportHeight );

        scene.closestZ = scene.planeSpan.getClosestPlaneZ();

        mat4.perspective( 45, gl.viewportWidth / gl.viewportHeight, 1.0, 40960, scene.pMatrix );
        mat4.lookAt( scene.cameraPos, [0,0,scene.closestZ], [0,1,0], scene.mvMatrix );
        //mat4.lookAt( scene.cameraPos, [scene.cameraPos[0], scene.cameraPos[1], scene.closestZ], [0,1,0], scene.mvMatrix );

        // Fixme: this isn't going to scale.
        ftg.mats.def.setProjectionUniform( scene.pMatrix );
        ftg.mats.silhouette.setProjectionUniform( scene.pMatrix );
        ftg.mats.shadowStamp.setProjectionUniform( scene.pMatrix );
        ftg.mats.normalAndDepth.setProjectionUniform( scene.pMatrix );
        //ftg.mats.bumpMap.setProjectionUniform( scene.pMatrix );

        //ftg.mats.bumpMap.setDirectionalLight( scene.lightPos, [1,1,1] );

        mvPushMatrix( scene );  
        scene.planeSpan.drawArrays( scene.mvMatrix, scene.rt.intermediate, undefined );
        //scene.planeSpan.drawArrays( scene.mvMatrix, scene.rt.intermediate, undefined, ftg.mats['normalAndDepth'] );
        mvPopMatrix( scene );
    }

    // Intermediate to screen
    {
        ftg.mats.post.useProgram();

        ftg.mats.post.bindTextures( [scene.rt.intermediate.texture] );
        ftg.drawTextureToViewport( ftg.mats.post, gl.viewportWidth, gl.viewportHeight );
    }
}

function animate() {

    if ( scene.animateCamera ) {

        /* Shift camera x & y.  Browser window is the available screen and
           it ranges from normalized -1 to 1 in x and y. */
        var w = $(window).width();
        var h = $(window).height();
        var nw = (scene.mouseX - (w/2))/w*2;
        var nh = (scene.mouseY - (h/2))/h*2;

        var MOVESCALE = -scene.closestZ/2.3;

        scene.cameraPos[0] = nw * -MOVESCALE;
        scene.cameraPos[1] = nh * MOVESCALE;
    }
    else
    {
        // animate the directional light in an arc instead

        var w = $(window).width();
        var h = $(window).height();
        var nw = (scene.mouseX - (w/2))/w*2;
        var nh = (scene.mouseY - (h/2))/h*2;

        scene.lightPos[0] = nw;
        scene.lightPos[1] = nh;

        // naively make z flatten out when we are near the 'edges'
        var dist = Math.max(Math.abs(nw),Math.abs(nh));
        scene.lightPos[2] = 1-dist;
    }


    var plane = scene.planeSpan.planes[scene.planeSpan.drawOrder[0][0]];
    //var plane = scene.planeSpan.planes[scene.planeSpan.drawOrder[scene.planeSpan.drawOrder.length-1][0]];
    var box = plane.obbs[0];

    //var rotate = mat4.create();
    //mat4.rotate(rotate, 3.1,[0,0,1],box.mat);

    box.deg = parseFloat(box.deg) + 1.1;
    box.buildMatrix();
}


// Main loop
function tick() {
    // Update timer
    requestAnimFrame( tick );

    // Update scene
    animate();

    // Draw scene
    draw(); 
}

function setCanvasSize() {
    var canvas = document.getElementById( 'maincanvas' );
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
}

function webGLStart() {
    var canvas = document.getElementById( 'maincanvas' );

    // resize handling -- diabled for sluggishness
    //$(window).resize( function() {setCanvasSize();});

    console.log( "Disable resize handling.");

    gl = WebGLUtils.setupWebGL(canvas);
    gl.viewportWidth  = canvas.width;
    gl.viewportHeight = canvas.height;
    setCanvasSize();

    ftg.init( gl );

    scene.panel = getArg('panel');
    initShaders();
    initBuffers( scene.panel );



    // mouse handling
    $(document).mousemove( function( e ) {
        scene.mouseX = parseFloat( event.pageX );
        scene.mouseY = parseFloat( event.pageY );
    });
    scene.mouseX = scene.mouseY = 0;

    $(document).keypress( function( e ) {
        var e = window.event || e;

        if ( e.keyCode == 32 ) // space
            scene.animateCamera = !scene.animateCamera;
    });
        
    /* cyan-green */
    gl.clearColor( 41/256, 69/256, 57/256, 1.0 );
    //gl.enable( gl.DEPTH_TEST );
    //gl.depthFunc( gl.ALWAYS );
    gl.enable( gl.BLEND );
    gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
    //gl.blendFunc( gl.SRC_ALPHA, gl.ONE );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    tick();



}
